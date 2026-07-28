// Minimal Plaid REST helper (raw fetch — no `plaid` dependency, light cold starts).
// Env: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox | development | production).
const ENV = process.env.PLAID_ENV || "sandbox";
const BASE = `https://${ENV}.plaid.com`;

export function plaidConfigured() {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export async function plaidFetch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_message || data.error_code || `Plaid ${res.status}`);
  return data;
}

export function plaidId(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 250); }

// Pull one item's balances + transactions into Firestore (Admin `db` passed in).
// Incremental via /transactions/sync cursor. Returns { accounts, added, removed }.
export async function syncPlaidItem(db, uid, itemId, accessToken, cursor) {
  const now = new Date().toISOString();

  let accountsN = 0;
  try {
    const acc = await plaidFetch("/accounts/get", { access_token: accessToken });
    const batch = db.batch();
    for (const a of acc.accounts || []) {
      const bal = a.balances || {};
      const current = Number(bal.current);
      const signed = a.type === "credit" || a.type === "loan" ? -Math.abs(current || 0) : (Number.isFinite(current) ? current : 0);
      batch.set(db.collection("accounts").doc(plaidId(`${uid}_plaid_${a.account_id}`)), {
        userId: uid, source: "plaid", external_id: a.account_id, item_id: itemId,
        name: `${a.name}${a.mask ? ` ••${a.mask}` : ""}`,
        type: a.subtype || a.type || "account",
        balance: signed, currency: bal.iso_currency_code || "USD", updated_date: now, created_date: now,
      }, { merge: true });
      accountsN++;
    }
    await batch.commit();
  } catch (err) { console.warn("plaid accounts:", err.message); }

  let added = 0, removed = 0, cur = cursor;
  try {
    let hasMore = true;
    while (hasMore) {
      const t = await plaidFetch("/transactions/sync", { access_token: accessToken, cursor: cur || undefined, count: 500 });
      const ups = [...(t.added || []), ...(t.modified || [])];
      for (let i = 0; i < ups.length; i += 400) {
        const batch = db.batch();
        for (const tx of ups.slice(i, i + 400)) {
          batch.set(db.collection("transactions").doc(plaidId(`${uid}_plaid_${tx.transaction_id}`)), {
            userId: uid, source: "plaid", external_id: tx.transaction_id, account_id: tx.account_id,
            date: tx.date, merchant: tx.merchant_name || tx.name || "(transaction)",
            amount: -Number(tx.amount || 0),
            category: mapPlaidCategory(tx), pending: !!tx.pending,
            updated_date: now, created_date: now,
          }, { merge: true });
        }
        await batch.commit();
        added += Math.min(ups.length - i, 400);
      }
      for (let i = 0; i < (t.removed || []).length; i += 400) {
        const batch = db.batch();
        for (const rm of (t.removed || []).slice(i, i + 400)) batch.delete(db.collection("transactions").doc(plaidId(`${uid}_plaid_${rm.transaction_id}`)));
        await batch.commit();
        removed += Math.min(t.removed.length - i, 400);
      }
      cur = t.next_cursor;
      hasMore = t.has_more;
    }
    await db.collection("plaid_items").doc(plaidId(`${uid}_${itemId}`)).set({ cursor: cur, updated_date: now }, { merge: true });
  } catch (err) { console.warn("plaid transactions:", err.message); }

  return { accounts: accountsN, added, removed };
}

// Map Plaid's personal-finance-category to our Money-tab categories.
export function mapPlaidCategory(tx) {
  const p = (tx?.personal_finance_category?.primary || "").toUpperCase();
  const m = {
    INCOME: "Income",
    TRANSFER_IN: "Income",
    FOOD_AND_DRINK: "Food",
    GENERAL_MERCHANDISE: "Shopping",
    GROCERIES: "Groceries",
    TRANSPORTATION: "Transport",
    TRAVEL: "Travel",
    RENT_AND_UTILITIES: "Bills & Utilities",
    ENTERTAINMENT: "Entertainment",
    MEDICAL: "Health",
    PERSONAL_CARE: "Health",
    LOAN_PAYMENTS: "Bills & Utilities",
  };
  if (m[p]) return m[p];
  // legacy category array fallback
  const c = Array.isArray(tx?.category) ? tx.category[0] : "";
  if (/food|restaurant/i.test(c)) return "Food";
  if (/travel/i.test(c)) return "Travel";
  if (/transfer|payroll|deposit/i.test(c)) return "Income";
  return ""; // let the client's keyword categorizer decide
}
