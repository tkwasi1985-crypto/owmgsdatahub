// GET /api/track?ref=OWM...   or   /api/track?phone=0241234567
import { json, fail, normalizePhone, maskPhone, start } from "../../lib/util.js";
import { orders, indexes } from "../../lib/db.js";
import { checkPayment, demoPayments } from "../../lib/paystack.js";
import { markPaidAndSend } from "../../lib/fulfil.js";

const view = (o) => ({
  ref: o.ref, network: o.network, bundle: o.bundleName, phone: maskPhone(o.phone),
  amount: o.amount, status: o.status, createdAt: o.createdAt, deliveredAt: o.deliveredAt || null,
});

// Backup in case the Paystack webhook is late or not set up
async function refresh(o) {
  if (o.status !== "pending" || demoPayments()) return o;
  try {
    const p = await checkPayment(o.ref);
    if (p.status === "success" && p.currency === "GHS") return (await markPaidAndSend(o.ref, p.amount, p.channel)) || o;
  } catch { /* not paid yet, or Paystack key missing */ }
  return o;
}

async function handler(req) {
  const u = new URL(req.url);
  const ref = (u.searchParams.get("ref") || "").trim().toUpperCase();

  if (ref) {
    let o = await orders().get(ref);
    if (!o) return fail("Order not found. Check the reference.", 404);
    o = await refresh(o);
    return json({ ok: true, orders: [view(o)] });
  }

  const phone = normalizePhone(u.searchParams.get("phone"));
  if (!phone) return fail("Enter your order reference or the phone number that received the data.");
  const keys = (await indexes().list(`phone/${phone}/`)).sort().reverse().slice(0, 10);
  const list = await orders().getMany(keys.map((k) => k.split("/")[2]));
  const fresh = await Promise.all(list.map(refresh));
  return json({ ok: true, orders: fresh.map(view) });
}

export const onRequest = (context) => start(context, handler);
