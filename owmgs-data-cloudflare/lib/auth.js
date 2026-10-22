// Passwords and login tokens
import { env } from "./util.js";
import { randomHex, pbkdf2Hex, hmacSha256B64, safeEqual, b64urlEncode, b64urlDecode } from "./crypto.js";
export { safeEqual };

const secret = () => {
  const s = env("AUTH_SECRET");
  if (s.length < 16) throw new Error("AUTH_SECRET is missing or too short. Add it in Cloudflare (Variables and Secrets), then redeploy.");
  return s;
};

export async function hashPassword(pw) {
  const salt = randomHex(16);
  return `pbkdf2:${salt}:${await pbkdf2Hex(pw, salt)}`;
}
export async function checkPassword(pw, stored) {
  if (!stored) return false;
  const [kind, salt, hash] = stored.split(":");
  if (kind !== "pbkdf2") return false;
  return safeEqual(await pbkdf2Hex(pw, salt), hash);
}

// role: "agent" or "admin". Tokens last 7 days (agents) or 12 hours (admin).
export async function makeToken(role, sub) {
  const hours = role === "admin" ? 12 : 24 * 7;
  const data = b64urlEncode(JSON.stringify({ role, sub, exp: Date.now() + hours * 3600e3 }));
  return `${data}.${await hmacSha256B64(secret(), data)}`;
}
export async function readToken(req) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [data, sig] = t.split(".");
  if (!data || !sig) return null;
  if (!safeEqual(sig, await hmacSha256B64(secret(), data))) return null;
  try {
    const p = JSON.parse(b64urlDecode(data));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
