import { start } from "../../lib/util.js";
// POST /api/paystack-webhook  -> Paystack calls this after a payment.
// Put this link in Paystack: Settings > API Keys & Webhooks > Webhook URL
//   https://YOUR-SITE/api/paystack-webhook
import { isRealPaystack } from "../../lib/paystack.js";
import { markPaidAndSend } from "../../lib/fulfil.js";

async function handler(req) {
  const raw = await req.text();
  if (!(await isRealPaystack(raw, req.headers.get("x-paystack-signature")))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let event;
  try { event = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

  if (event.event === "charge.success" && event.data?.status === "success" && event.data?.currency === "GHS") {
    await markPaidAndSend(event.data.reference, event.data.amount, event.data.channel);
  }
  return new Response("OK", { status: 200 });
}

export const onRequest = (context) => start(context, handler);
