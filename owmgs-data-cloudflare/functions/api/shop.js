// GET /api/shop  -> shop settings + bundle list (agent prices if an agent is logged in)
import { json, getBundles, getConfig, start } from "../../lib/util.js";
import { getAgent } from "../../lib/session.js";

async function handler(req) {
  const [bundles, c, agent] = await Promise.all([getBundles(), getConfig(), getAgent(req)]);
  return json({
    ok: true,
    site: { name: c.siteName, tagline: c.tagline, whatsapp: c.whatsapp, notice: c.notice, open: c.shopOpen },
    agent: agent ? { name: agent.name, phone: agent.phone } : null,
    bundles: bundles
      .filter((b) => b.active)
      .map((b) => ({
        id: b.id, network: b.network, name: b.name, sizeGB: b.sizeGB, validity: b.validity,
        price: agent ? b.agentPrice : b.price,
        normalPrice: b.price,
      })),
  });
}

export const onRequest = (context) => start(context, handler);
