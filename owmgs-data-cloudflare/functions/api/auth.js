// POST /api/auth  { action: "register" | "login" | "admin-login" | "password", ... }
import { json, fail, body, normalizePhone, env, start } from "../../lib/util.js";
import { users } from "../../lib/db.js";
import { hashPassword, checkPassword, makeToken, safeEqual } from "../../lib/auth.js";
import { getAgent } from "../../lib/session.js";

const pause = () => new Promise((r) => setTimeout(r, 600)); // slows down password guessing

async function handler(req) {
  if (req.method !== "POST") return fail("Use POST", 405);
  const b = await body(req);

  if (b.action === "admin-login") {
    const real = env("ADMIN_PASSWORD");
    if (!real) return fail("ADMIN_PASSWORD is not set in Cloudflare.");
    if (!safeEqual(b.password || "", real)) { await pause(); return fail("Wrong password.", 401); }
    return json({ ok: true, token: await makeToken("admin", "admin") });
  }

  if (b.action === "register") {
    const phone = normalizePhone(b.phone);
    const name = String(b.name || "").trim().slice(0, 60);
    if (!name) return fail("Enter your name.");
    if (!phone) return fail("Enter a valid Ghana phone number.");
    if (String(b.password || "").length < 6) return fail("Password must be at least 6 characters.");
    const res = await users().set(phone, {
      name, phone, business: String(b.business || "").trim().slice(0, 80),
      location: String(b.location || "").trim().slice(0, 60),
      pass: await hashPassword(b.password), status: "pending", createdAt: new Date().toISOString(),
    }, { onlyIfNew: true });
    if (!res.modified) return fail("This number already has an account. Please log in.");
    return json({ ok: true, message: "Account created. Wait for the admin to approve you, then log in." });
  }

  if (b.action === "login") {
    const phone = normalizePhone(b.phone);
    const u = phone ? await users().get(phone) : null;
    if (!u || !(await checkPassword(String(b.password || ""), u.pass))) { await pause(); return fail("Wrong phone number or password.", 401); }
    if (u.status === "pending") return fail("Your account is waiting for approval.", 403);
    if (u.status !== "approved") return fail("Your account is blocked. Contact the admin.", 403);
    return json({ ok: true, token: await makeToken("agent", phone), agent: { name: u.name, phone } });
  }

  if (b.action === "password") {
    const a = await getAgent(req);
    if (!a) return fail("Please log in again.", 401);
    if (!(await checkPassword(String(b.old || ""), a.pass))) return fail("Old password is wrong.");
    if (String(b.password || "").length < 6) return fail("New password must be at least 6 characters.");
    await users().set(a.phone, { ...a, pass: await hashPassword(b.password) });
    return json({ ok: true, message: "Password changed." });
  }

  return fail("Unknown action");
}

export const onRequest = (context) => start(context, handler);
