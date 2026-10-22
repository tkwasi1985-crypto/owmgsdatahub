// POST /api/order  -> creates an order and returns the Paystack payment link
import { json, fail, body, normalizePhone, guessNetwork, newRef, getBundles, getConfig, env, start } from "../../lib/util.js";
import { orders, indexes } from "../../lib/db.js";
import { getAgent } from "../../lib/session.js";
import { startPayment, demoPayments } from "../../lib/paystack.js";
import { markPaidAndSend } from "../../lib/fulfil.js";

async function handler(req) {
  if (req.method !== "POST") return fail("Use POST", 405);
  const b = await body(req);
  const c = await getConfig();
  if (!c.shopOpen) return fail("The shop is closed right now. Please try again later.");

  const bundle = (await getBundles()).find((x) => x.id === b.bundleId && x.active);
  if (!bundle) return fail("Please choose a bundle.");

  const phone = normalizePhone(b.phone);
  if (!phone) return fail("Enter a valid Ghana number, e.g. 0241234567.");
  const guessed = guessNetwork(phone);
  if (guessed && guessed !== bundle.network && !b.confirmNetwork) {
    return json({ ok: false, needConfirm: true,
      error: `${phone} looks like a ${guessed} number but you chose ${bundle.network} data. If the number was ported, tick "I am sure" and try again.` });
  }
  const notifyPhone = b.notifyPhone ? normalizePhone(b.notifyPhone) : null;
  if (b.notifyPhone && !notifyPhone) return fail("The SMS number is not valid.");

  const agent = await getAgent(req);
  const amount = agent ? bundle.agentPrice : bundle.price;
  const ref = newRef();
  const createdAt = new Date().toISOString();
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || "")
    ? b.email.trim()
    : `customer${phone}@${env("STORE_EMAIL_DOMAIN", "owmgs.com")}`;

  const order = {
    ref, createdAt, status: "pending",
    bundleId: bundle.id, network: bundle.network, bundleName: bundle.name,
    supplierCode: bundle.supplierCode, supplierNetwork: bundle.supplierNetwork || "",
    phone, notifyPhone: notifyPhone || phone, email,
    amount, cost: bundle.cost,
    buyer: agent ? "agent" : "customer", agentPhone: agent?.phone || "", agentName: agent?.name || "",
  };
  await orders().set(ref, order);
  await indexes().set(`phone/${phone}/${ref}`, 1);
  if (agent) await indexes().set(`agent/${agent.phone}/${ref}`, 1);

  const site = env("SITE_URL") || new URL(req.url).origin;
  const trackUrl = `${site}/track.html?ref=${ref}`;

  if (demoPayments()) {
    await markPaidAndSend(ref, Math.round(amount * 100), "demo");
    return json({ ok: true, ref, redirect: trackUrl, demo: true });
  }

  try {
    const p = await startPayment({
      email, amount, reference: ref, callbackUrl: trackUrl,
      metadata: { phone, bundle: `${bundle.network} ${bundle.name}`, buyer: order.buyer },
    });
    return json({ ok: true, ref, redirect: p.authorization_url });
  } catch (e) {
    order.status = "cancelled";
    order.note = "Payment could not start: " + e.message;
    await orders().set(ref, order);
    return fail("Payment could not start. Please try again in a moment.", 502);
  }
}

export const onRequest = (context) => start(context, handler);
