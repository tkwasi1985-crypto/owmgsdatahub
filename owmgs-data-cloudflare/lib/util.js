import { settings, initDb } from "./db.js";
import { randomHex } from "./crypto.js";

// Settings from Cloudflare (Settings > Variables and Secrets)
let ENV = {};
export const env = (k, d = "") => String(ENV[k] ?? d).trim();

// Every API file runs through this: loads settings + database, catches errors
export async function start(context, handler) {
  try {
    ENV = context.env || {};
    initDb(ENV);
    return await handler(context.request);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e.message || "Server error" }, 500);
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
export const fail = (message, status = 400) => json({ ok: false, error: message }, status);

export async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

// Ghana numbers: accepts 0241234567, 241234567, 233241234567, +233 24 123 4567
export function normalizePhone(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.startsWith("233")) d = d.slice(3);
  if (d.length === 9) d = "0" + d;
  return /^0[25]\d{8}$/.test(d) ? d : null;
}
export const intlPhone = (local) => "233" + local.slice(1);

const PREFIXES = {
  MTN: ["024", "054", "055", "059", "025", "053"],
  Telecel: ["020", "050"],
  AT: ["026", "056", "027", "057"],
};
export function guessNetwork(local) {
  const p = local.slice(0, 3);
  return Object.keys(PREFIXES).find((n) => PREFIXES[n].includes(p)) || null;
}

export function newRef() {
  return "OWM" + Date.now().toString(36).toUpperCase() + randomHex(3).toUpperCase();
}

export const maskPhone = (p) => (p ? p.slice(0, 3) + "****" + p.slice(-3) : "");
export const money = (n) => Math.round(Number(n) * 100) / 100;

// ---------- Bundles (prices) ----------
// SAMPLE prices only. Change them in the Admin page before you go live.
// price = what customers pay, agentPrice = what agents pay, cost = what your supplier charges you.
// supplierCode = the plan/package code your supplier's API expects for this bundle.
function defaultBundles() {
  const make = (network, sizes) =>
    sizes.map(([gb, price, agentPrice, cost]) => ({
      id: `${network}-${gb}GB`.toLowerCase(),
      network, name: `${gb}GB`, sizeGB: gb, price, agentPrice, cost,
      supplierCode: String(gb), validity: "Non-expiry", active: true,
    }));
  return [
    ...make("MTN", [[1, 6.5, 5.8, 5.2], [2, 12.5, 11.5, 10.4], [5, 30, 27.5, 25.5], [10, 58, 53, 50]]),
    ...make("Telecel", [[5, 28, 25.5, 24], [10, 52, 48, 45]]),
    ...make("AT", [[1, 5, 4.5, 4], [5, 22, 20, 18.5], [10, 42, 38.5, 36]]),
  ];
}

export async function getBundles() {
  const s = settings();
  let b = await s.get("bundles");
  if (!b) { b = defaultBundles(); await s.set("bundles", b); }
  return b;
}

const DEFAULT_CONFIG = {
  siteName: "OWMGS Data",
  tagline: "Cheap MTN, Telecel and AT data. Delivered in minutes.",
  whatsapp: "",          // e.g. 233249021637
  notice: "",            // short message shown at the top of the shop
  shopOpen: true,
  paystackFeePercent: 1.95, // used only to estimate profit; check your Paystack dashboard
  smsDelivered: "Hi! Your {bundle} {network} data for {phone} has been sent. Ref: {ref}. Thank you for buying from {site}.",
  smsFailed: "Sorry, your {bundle} {network} data for {phone} could not be sent yet. We are working on it. Ref: {ref}. {site}",
};
export async function getConfig() {
  const c = await settings().get("config");
  return { ...DEFAULT_CONFIG, ...(c || {}) };
}
export const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
