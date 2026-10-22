// ============================================================
//  SUPPLIER  (where your site buys the bundles from)
// ============================================================
// Set SUPPLIER in Cloudflare:
//   SUPPLIER=demo     -> pretends every bundle was sent (for testing only)
//   SUPPLIER=generic  -> calls your real supplier's API (settings below)
//
// For "generic", also set:
//   SUPPLIER_API_URL     the "buy data" link from your supplier's API docs
//   SUPPLIER_API_KEY     your API key from the supplier dashboard
//   SUPPLIER_KEY_HEADER  header name for the key (default: x-api-key)
//
// Every supplier's API is a little different. When you choose one
// (DataMart, BestDeals, etc.), open their API docs and change ONLY the
// part marked "CHANGE HERE" below so the field names match theirs.
// ============================================================
import { env } from "./util.js";

async function demoBuy(order) {
  return { ok: true, supplierRef: "DEMO-" + order.ref, message: "Demo mode: bundle not really sent" };
}

async function genericBuy(order) {
  const url = env("SUPPLIER_API_URL");
  const apiKey = env("SUPPLIER_API_KEY");
  if (!url || !apiKey) return { ok: false, message: "Supplier API URL or key not set" };

  // ----- CHANGE HERE: field names your supplier expects -----
  const payload = {
    network: order.supplierNetwork || order.network, // e.g. "MTN", "TELECEL", "AT"
    capacity: order.supplierCode,                    // the plan code you set for the bundle in Admin
    phoneNumber: order.phone,                        // e.g. 0241234567
    reference: order.ref,                            // your order reference
  };
  // -----------------------------------------------------------

  let res, data;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", [env("SUPPLIER_KEY_HEADER", "x-api-key")]: apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, message: "Could not reach supplier: " + e.message };
  }

  // ----- CHANGE HERE if your supplier reports success differently -----
  const bad = ["error", "failed", "fail", false];
  const ok = res.ok && !bad.includes(data.status) && data.success !== false;
  return {
    ok,
    supplierRef: data.reference || data.transactionId || data.data?.reference || data.data?.id || "",
    message: data.message || (ok ? "Sent" : `Supplier error ${res.status}`),
  };
}

export async function buyBundle(order) {
  const mode = env("SUPPLIER", "demo").toLowerCase();
  if (mode === "generic") return genericBuy(order);
  return demoBuy(order);
}
export const supplierMode = () => env("SUPPLIER", "demo").toLowerCase();
