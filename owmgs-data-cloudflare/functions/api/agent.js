// GET /api/agent  -> logged-in agent's profile and orders
import { json, fail, money, start } from "../../lib/util.js";
import { orders, indexes } from "../../lib/db.js";
import { getAgent } from "../../lib/session.js";

async function handler(req) {
  const a = await getAgent(req);
  if (!a) return fail("Please log in again.", 401);
  const keys = (await indexes().list(`agent/${a.phone}/`)).sort().reverse();
  const recent = await orders().getMany(keys.slice(0, 100).map((k) => k.split("/")[2]));
  const done = recent.filter((o) => o.status === "delivered");
  return json({
    ok: true,
    agent: { name: a.name, phone: a.phone, business: a.business, since: a.createdAt },
    stats: { orders: keys.length, delivered: done.length, spent: money(done.reduce((s, o) => s + o.amount, 0)) },
    orders: recent.map((o) => ({
      ref: o.ref, network: o.network, bundle: o.bundleName, phone: o.phone,
      amount: o.amount, status: o.status, createdAt: o.createdAt,
    })),
  });
}

export const onRequest = (context) => start(context, handler);
