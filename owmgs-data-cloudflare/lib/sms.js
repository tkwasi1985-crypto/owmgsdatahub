// SMS after a successful (or failed) order.
// Set SMS_PROVIDER in Cloudflare: arkesel, mnotify, or none
//   SMS_API_KEY   your key from the SMS company
//   SMS_SENDER    your approved Sender ID, max 11 letters (e.g. OWMGS)
import { env, intlPhone } from "./util.js";

export async function sendSms(localPhone, message) {
  const provider = env("SMS_PROVIDER", "none").toLowerCase();
  const key = env("SMS_API_KEY");
  const sender = env("SMS_SENDER", "OWMGS").slice(0, 11);
  if (provider === "none" || !key || !localPhone) return { sent: false, reason: "SMS off" };

  try {
    let r;
    if (provider === "arkesel") {
      r = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ sender, message, recipients: [intlPhone(localPhone)] }),
        signal: AbortSignal.timeout(15000),
      });
    } else if (provider === "mnotify") {
      r = await fetch(`https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: [localPhone], sender, message, is_schedule: false, schedule_date: "" }),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      return { sent: false, reason: "Unknown SMS_PROVIDER" };
    }
    return { sent: r.ok, reason: r.ok ? "" : `SMS error ${r.status}` };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}
