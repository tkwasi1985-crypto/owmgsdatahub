// Paystack: MoMo and card payments
import { env } from "./util.js";
import { hmacSha512Hex, safeEqual } from "./crypto.js";

const API = "https://api.paystack.co";
const key = () => env("PAYSTACK_SECRET_KEY");

// Demo payments: ONLY for testing. Orders are treated as paid without real money.
// Turn on by setting DEMO_PAYMENTS=yes. Never leave it on when you go live.
export const demoPayments = () => env("DEMO_PAYMENTS").toLowerCase() === "yes";

async function call(path, opts = {}) {
  if (!key()) throw new Error("PAYSTACK_SECRET_KEY is not set in Cloudflare");
  const r = await fetch(API + path, {
    ...opts,
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.status === false) throw new Error(data.message || `Paystack error ${r.status}`);
  return data.data;
}

// amount in Ghana cedis. Paystack wants pesewas (x100).
export function startPayment({ email, amount, reference, callbackUrl, metadata }) {
  return call("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email, reference, currency: "GHS",
      amount: Math.round(amount * 100),
      callback_url: callbackUrl,
      channels: ["mobile_money", "card"],
      metadata,
    }),
  });
}

export const checkPayment = (reference) => call(`/transaction/verify/${encodeURIComponent(reference)}`);

// Makes sure a webhook really came from Paystack
export async function isRealPaystack(rawBody, signature) {
  if (!key() || !signature) return false;
  return safeEqual(await hmacSha512Hex(key(), rawBody), signature);
}
