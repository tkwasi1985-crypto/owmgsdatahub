// POST /api/admin  { action, ... }   (admin login required)
import { json, fail, body, money, getBundles, getConfig, normalizePhone, env, start } from "../../lib/util.js";
import { orders, users, settings } from "../../lib/db.js";
import { isAdmin } from "../../lib/session.js";
import { retryOrder } from "../../lib/fulfil.js";
import { sendSms } from "../../lib/sms.js";
import { supplierMode } from "../../lib/supplier.js";
import { demoPayments } from "../../lib/paystack.js";

// Order refs start with OWM + the time, so sorting by ref = sorting by time
async function loadOrders(sinceMs = 0, max = 3000) {
  const fromKey = sinceMs ? "OWM" + Math.floor(sinceMs).toString(36).toUpperCase() : "OWM";
  return orders().values("OWM", fromKey, max);
}

function summary(list, feePct) {
  const done = list.filter((o) => o.status === "delivered");
  const sales = done.reduce((s, o) => s + o.amount, 0);
  const cost = done.reduce((s, o) => s + (o.cost || 0), 0);
  const fees = (sales * feePct) / 100;
  return { orders: done.length, sales: money(sales), cost: money(cost), fees: money(fees), profit: money(sales - cost - fees) };
}

async function handler(req) {
  if (req.method !== "POST") return fail("Use POST", 405);
  if (!(await isAdmin(req))) return fail("Please log in again.", 401);
  const b = await body(req);
  const c = await getConfig();

  switch (b.action) {
    case "overview": {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1));
      const chartStart = dayStart.getTime() - 13 * 864e5;
      const all = await loadOrders(Math.min(chartStart, monthStart.getTime()));
      const month = all.filter((o) => Date.parse(o.createdAt) >= monthStart.getTime());
      const today = all.filter((o) => Date.parse(o.createdAt) >= dayStart.getTime());
      const agents = await users().values("");
      // last 14 days, for the chart
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const t0 = dayStart.getTime() - i * 864e5;
        const list = all.filter((o) => { const t = Date.parse(o.createdAt); return t >= t0 && t < t0 + 864e5; });
        days.push({ day: new Date(t0).toISOString().slice(5, 10), ...summary(list, c.paystackFeePercent) });
      }
      const count = (s) => month.filter((o) => o.status === s).length;
      return json({
        ok: true,
        today: summary(today, c.paystackFeePercent),
        month: summary(month, c.paystackFeePercent),
        attention: { failed: count("failed"), processing: count("processing"), underpaid: count("underpaid"),
                     pendingAgents: agents.filter((a) => a.status === "pending").length },
        days,
        system: { supplier: supplierMode(), demoPayments: demoPayments(), sms: env("SMS_PROVIDER", "none"),
                  paystack: !!env("PAYSTACK_SECRET_KEY") },
      });
    }

    case "orders": {
      let list = await loadOrders(0, b.status || b.q ? 3000 : 300);
      if (b.status) list = list.filter((o) => o.status === b.status);
      if (b.q) {
        const q = String(b.q).toLowerCase();
        list = list.filter((o) => [o.ref, o.phone, o.agentName, o.agentPhone].join(" ").toLowerCase().includes(q));
      }
      return json({ ok: true, orders: list.slice(0, 300) });
    }

    case "order-retry": {
      const o = await retryOrder(String(b.ref || ""));
      return o ? json({ ok: true, order: o }) : fail("Order not found");
    }

    case "order-mark": {
      const allowed = ["delivered", "failed", "refunded", "cancelled"];
      if (!allowed.includes(b.status)) return fail("Bad status");
      const o = await orders().get(String(b.ref || ""));
      if (!o) return fail("Order not found");
      o.status = b.status;
      o.note = String(b.note || "").slice(0, 200);
      o.updatedAt = new Date().toISOString();
      if (b.status === "delivered" && !o.deliveredAt) o.deliveredAt = o.updatedAt;
      await orders().set(o.ref, o);
      return json({ ok: true, order: o });
    }

    case "bundles-get":
      return json({ ok: true, bundles: await getBundles() });

    case "bundles-save": {
      if (!Array.isArray(b.bundles)) return fail("No bundles sent");
      const ids = new Set();
      const clean = [];
      for (const x of b.bundles) {
        const network = ["MTN", "Telecel", "AT"].includes(x.network) ? x.network : null;
        const name = String(x.name || "").trim().slice(0, 30);
        const price = money(x.price), agentPrice = money(x.agentPrice), cost = money(x.cost);
        if (!network || !name || !(price > 0) || !(agentPrice > 0)) return fail(`Check the row "${network || "?"} ${name}". Network, name, price and agent price are needed.`);
        let id = String(x.id || `${network}-${name}`).toLowerCase().replace(/[^a-z0-9-]/g, "");
        while (ids.has(id)) id += "x";
        ids.add(id);
        clean.push({ id, network, name, sizeGB: Number(x.sizeGB) || 0, price, agentPrice, cost: cost || 0,
                     supplierCode: String(x.supplierCode || "").trim(), supplierNetwork: String(x.supplierNetwork || "").trim(),
                     validity: String(x.validity || "").trim().slice(0, 30), active: x.active !== false });
      }
      await settings().set("bundles", clean);
      return json({ ok: true, bundles: clean });
    }

    case "config-get":
      return json({ ok: true, config: c });

    case "config-save": {
      const n = b.config || {};
      const next = {
        siteName: String(n.siteName ?? c.siteName).slice(0, 40),
        tagline: String(n.tagline ?? c.tagline).slice(0, 120),
        whatsapp: String(n.whatsapp ?? c.whatsapp).replace(/\D/g, "").slice(0, 15),
        notice: String(n.notice ?? c.notice).slice(0, 200),
        shopOpen: n.shopOpen !== false,
        paystackFeePercent: Math.max(0, Math.min(10, Number(n.paystackFeePercent ?? c.paystackFeePercent) || 0)),
        smsDelivered: String(n.smsDelivered ?? c.smsDelivered).slice(0, 300),
        smsFailed: String(n.smsFailed ?? c.smsFailed).slice(0, 300),
      };
      await settings().set("config", next);
      return json({ ok: true, config: next });
    }

    case "agents": {
      const list = (await users().values(""))
        .map(({ pass, ...a }) => a).sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
      return json({ ok: true, agents: list });
    }

    case "agent-status": {
      if (!["approved", "blocked", "pending"].includes(b.status)) return fail("Bad status");
      const phone = normalizePhone(b.phone);
      const a = phone && (await users().get(phone));
      if (!a) return fail("Agent not found");
      a.status = b.status;
      await users().set(phone, a);
      if (b.status === "approved") await sendSms(phone, `Hello ${a.name}, your ${c.siteName} agent account is approved. You can now log in and buy at agent prices.`);
      return json({ ok: true });
    }

    case "test-sms": {
      const phone = normalizePhone(b.phone);
      if (!phone) return fail("Enter a valid number");
      const r = await sendSms(phone, `Test SMS from ${c.siteName}. SMS is working!`);
      return r.sent ? json({ ok: true, message: "SMS sent." }) : fail("SMS not sent: " + r.reason);
    }

    default:
      return fail("Unknown action");
  }
}

export const onRequest = (context) => start(context, handler);
