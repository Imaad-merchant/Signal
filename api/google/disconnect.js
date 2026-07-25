// Disconnect Google: delete the stored refresh token for this user.
// POST (owner-scoped). Best-effort revoke at Google, then remove the token doc.
import { verifyAuth } from "../_auth.js";
import { getAdminDb, isAdminConfigured } from "../_firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let auth;
  try {
    auth = await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!isAdminConfigured()) return res.status(503).json({ error: "Server not configured" });

  try {
    const db = getAdminDb();
    const ref = db.collection("google_tokens").doc(auth.uid);
    const snap = await ref.get();
    const refreshToken = snap.exists ? snap.data().refresh_token : null;
    if (refreshToken) {
      // Best-effort revoke; ignore failures.
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
      } catch { /* ignore */ }
    }
    await ref.delete();
    return res.status(200).json({ disconnected: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Disconnect failed" });
  }
}
