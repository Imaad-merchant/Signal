import { base44 } from "@/api/base44Client";

// Load Plaid's Link SDK once (from Plaid's CDN).
let scriptPromise = null;
function loadPlaidScript() {
  if (window.Plaid) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Plaid Link"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Open Plaid Link to connect a bank. On success, exchanges the public_token
// server-side (which also runs the first sync). Returns the exchange summary, or
// throws with a message. onExit fires if the user closes Link.
export async function connectBank({ onExit } = {}) {
  const tokRes = await base44.functions.invoke("donna", { route: "plaid-link-token" });
  const linkToken = tokRes?.data?.link_token || tokRes?.link_token;
  if (!linkToken) throw new Error(tokRes?.data?.error || tokRes?.error || "Plaid isn't set up on the server yet.");

  await loadPlaidScript();

  return new Promise((resolve, reject) => {
    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (public_token) => {
        try {
          const ex = await base44.functions.invoke("donna", { route: "plaid-exchange", public_token });
          resolve(ex?.data || ex || { ok: true });
        } catch (err) { reject(err); }
      },
      onExit: (err) => { if (onExit) onExit(err); resolve(null); },
    });
    handler.open();
  });
}

// Re-sync all connected banks.
export async function syncBanks() {
  const res = await base44.functions.invoke("donna", { route: "plaid-sync" });
  return res?.data || res || {};
}
