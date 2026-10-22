// Shared helpers for all pages
const OWM = {
  tokenKey: { agent: "owm_agent_token", admin: "owm_admin_token" },
  getToken(role) { try { return localStorage.getItem(this.tokenKey[role]) || ""; } catch { return ""; } },
  setToken(role, t) { try { t ? localStorage.setItem(this.tokenKey[role], t) : localStorage.removeItem(this.tokenKey[role]); } catch {} },

  async api(path, { method = "GET", data, role } = {}) {
    const headers = { "content-type": "application/json" };
    const t = role ? this.getToken(role) : "";
    if (t) headers.authorization = "Bearer " + t;
    let res, out;
    try {
      res = await fetch(path, { method, headers, body: data ? JSON.stringify(data) : undefined });
      out = await res.json();
    } catch {
      return { ok: false, error: "Network problem. Check your internet and try again." };
    }
    if (res.status === 401 && role) this.setToken(role, "");
    return out;
  },

  cedi: (n) => "GH₵ " + Number(n || 0).toFixed(2),
  when: (iso) => iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "",
  esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),

  statusText: {
    pending: "Waiting for payment", paid: "Paid", processing: "Sending", delivered: "Sent",
    failed: "Failed", underpaid: "Underpaid", refunded: "Refunded", cancelled: "Cancelled",
    approved: "Approved", blocked: "Blocked",
  },
  badge(s) { return `<span class="badge ${s}">${this.statusText[s] || s}</span>`; },

  toast(msg, ms = 3200) {
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), ms);
  },

  busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (label || ""); }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
  },

  prefixes: { MTN: ["024", "054", "055", "059", "025", "053"], Telecel: ["020", "050"], AT: ["026", "056", "027", "057"] },
  cleanPhone(v) {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith("233")) d = d.slice(3);
    if (d.length === 9) d = "0" + d;
    return /^0[25]\d{8}$/.test(d) ? d : null;
  },
  networkOf(p) { const x = p.slice(0, 3); return Object.keys(this.prefixes).find((n) => this.prefixes[n].includes(x)) || null; },
};
