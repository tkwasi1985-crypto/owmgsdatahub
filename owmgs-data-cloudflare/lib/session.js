import { readToken } from "./auth.js";
import { users } from "./db.js";

// Returns the logged-in agent (approved only), or null
export async function getAgent(req) {
  const t = await readToken(req);
  if (!t || t.role !== "agent") return null;
  const u = await users().get(t.sub);
  return u && u.status === "approved" ? u : null;
}

export async function isAdmin(req) {
  const t = await readToken(req);
  return !!t && t.role === "admin";
}
