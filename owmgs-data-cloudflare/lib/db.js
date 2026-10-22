// Database helper using Cloudflare D1 (free SQL database).
// In Cloudflare Pages: Settings > Bindings > add a D1 database binding named  DB
// The table is created automatically the first time the site runs.
let DB = null;
let ready = null;

export function initDb(env) {
  if (!env.DB) throw new Error("Database not connected. In Cloudflare Pages add a D1 binding named DB, then redeploy.");
  DB = env.DB;
}

async function ensureTable() {
  if (!ready) {
    ready = DB.prepare(
      "CREATE TABLE IF NOT EXISTS kv (store TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (store, k))"
    ).run().catch((e) => { ready = null; throw e; });
  }
  await ready;
}

function store(name) {
  return {
    async get(k) {
      await ensureTable();
      const row = await DB.prepare("SELECT v FROM kv WHERE store = ? AND k = ?").bind(name, k).first();
      return row ? JSON.parse(row.v) : null;
    },
    // opts.onlyIfNew: only saves if the key does not exist yet (returns modified:false otherwise)
    async set(k, value, opts = {}) {
      await ensureTable();
      const v = JSON.stringify(value);
      const sql = opts.onlyIfNew
        ? "INSERT OR IGNORE INTO kv (store, k, v) VALUES (?, ?, ?)"
        : "INSERT INTO kv (store, k, v) VALUES (?, ?, ?) ON CONFLICT(store, k) DO UPDATE SET v = excluded.v";
      const r = await DB.prepare(sql).bind(name, k, v).run();
      return { modified: (r.meta?.changes ?? 1) > 0 };
    },
    async del(k) {
      await ensureTable();
      await DB.prepare("DELETE FROM kv WHERE store = ? AND k = ?").bind(name, k).run();
    },
    // Many keys at once (uses few queries — the free plan allows 50 per request)
    async getMany(keys) {
      await ensureTable();
      const out = new Map();
      for (let i = 0; i < keys.length; i += 90) {
        const part = keys.slice(i, i + 90);
        const { results } = await DB.prepare(`SELECT k, v FROM kv WHERE store = ? AND k IN (${part.map(() => "?").join(",")})`)
          .bind(name, ...part).all();
        for (const r of results) out.set(r.k, JSON.parse(r.v));
      }
      return keys.map((k) => out.get(k)).filter(Boolean);
    },
    // All values whose key starts with prefix (and is >= fromKey), newest key first
    async values(prefix = "", fromKey = "", limit = 5000) {
      await ensureTable();
      const { results } = await DB.prepare("SELECT v FROM kv WHERE store = ? AND k >= ? AND k < ? ORDER BY k DESC LIMIT ?")
        .bind(name, fromKey > prefix ? fromKey : prefix, prefix + "￿", limit).all();
      return results.map((r) => JSON.parse(r.v));
    },
    async list(prefix = "") {
      await ensureTable();
      const { results } = await DB.prepare("SELECT k FROM kv WHERE store = ? AND k >= ? AND k < ? ORDER BY k")
        .bind(name, prefix, prefix + "￿").all();
      return results.map((r) => r.k);
    },
  };
}

// Stores used by the app
export const orders = () => store("orders");     // key: order reference
export const indexes = () => store("indexes");   // keys like phone/<number>/<ref>, agent/<number>/<ref>
export const users = () => store("users");       // key: agent phone number
export const settings = () => store("settings"); // keys: bundles, config
export const locks = () => store("locks");       // stops an order being sent twice
