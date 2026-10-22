// What happens after a customer pays: send the bundle, then send an SMS.
import { orders, locks } from "./db.js";
import { buyBundle } from "./supplier.js";
import { sendSms } from "./sms.js";
import { getConfig, fill, env } from "./util.js";

const now = () => new Date().toISOString();

// Called by the Paystack webhook (and as a backup by the tracking page).
// paidPesewas = amount Paystack says was paid.
export async function markPaidAndSend(ref, paidPesewas, channel = "") {
  const store = orders();
  const o = await store.get(ref);
  if (!o) return null;
  if (o.status === "pending") {
    if (Math.round(o.amount * 100) > Number(paidPesewas || 0)) {
      o.status = "underpaid";
      o.note = `Paid ${(paidPesewas / 100).toFixed(2)} but price is ${o.amount}`;
      o.updatedAt = now();
      await store.set(ref, o);
      return o;
    }
    o.status = "paid";
    o.paidAt = now();
    o.channel = channel;
    await store.set(ref, o);
  }
  return sendBundle(ref);
}

export async function sendBundle(ref) {
  const store = orders();
  let o = await store.get(ref);
  if (!o || o.status !== "paid") return o;

  // Lock so the same order is never sent twice
  const lock = await locks().set("send-" + ref, { at: now() }, { onlyIfNew: true });
  if (!lock.modified) return o;

  o.status = "processing";
  o.updatedAt = now();
  await store.set(ref, o);

  let r;
  try { r = await buyBundle(o); } catch (e) { r = { ok: false, message: e.message }; }

  o = { ...o, status: r.ok ? "delivered" : "failed", supplierRef: r.supplierRef || "",
        supplierMessage: r.message || "", updatedAt: now() };
  if (r.ok) o.deliveredAt = now();
  await store.set(ref, o);

  // SMS to the customer
  const c = await getConfig();
  const vars = { bundle: o.bundleName, network: o.network, phone: o.phone, ref: o.ref, site: c.siteName };
  const msg = fill(r.ok ? c.smsDelivered : c.smsFailed, vars);
  const sms = await sendSms(o.notifyPhone || o.phone, msg);
  o.smsSent = sms.sent;
  await store.set(ref, o);

  // Tell the owner when something fails
  if (!r.ok && env("ADMIN_PHONE")) {
    await sendSms(env("ADMIN_PHONE"), `FAILED order ${o.ref}: ${o.network} ${o.bundleName} to ${o.phone}. ${o.supplierMessage}`);
  }
  return o;
}

// Admin "Try again" button
export async function retryOrder(ref) {
  const store = orders();
  const o = await store.get(ref);
  if (!o || !["failed", "processing"].includes(o.status)) return o;
  await locks().del("send-" + ref);
  o.status = "paid";
  await store.set(ref, o);
  return sendBundle(ref);
}
