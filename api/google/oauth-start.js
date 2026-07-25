// Begin the Google OAuth connect flow.
//
// POST (owner-scoped, Firebase bearer token) → { url }. The client then navigates
// to `url`. We sign the user's uid into `state` so the callback can attribute the
// resulting refresh token without a session.
import { verifyAuth } from "../_auth.js";
import { buildAuthUrl } from "./_client.js";
import { signState } from "./_state.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let auth;
  try {
    auth = await verifyAuth(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(503).json({ error: "Google not configured on the server (missing GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI)" });
  }

  try {
    const state = signState(auth.uid);
    const url = buildAuthUrl({ clientId, redirectUri, state });
    return res.status(200).json({ url });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Could not start Google OAuth" });
  }
}
