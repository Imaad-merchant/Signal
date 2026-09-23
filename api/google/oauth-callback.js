// Google redirects here after consent: GET ?code=...&state=...
//
// No bearer token on this hop (it's a browser redirect from Google), so we trust
// the HMAC-signed `state` to know which user connected. We exchange the code for a
// refresh token and store it — server-only — in google_tokens/{uid}, then bounce
// the user back to /cowork with a status flag.
import { exchangeCode } from "./_client.js";
import { verifyState } from "./_state.js";
import { getAdminDb, isAdminConfigured } from "../_firebaseAdmin.js";

function redirectBack(res, status) {
  const app = process.env.APP_URL || "";
  res.writeHead(302, { Location: `${app}/Donna?google=${status}` });
  res.end();
}

export default async function handler(req, res) {
  const { code, state, error } = req.query || {};

  if (error) return redirectBack(res, "denied");
  if (!code || !state) return redirectBack(res, "error");

  let uid;
  try {
    ({ uid } = verifyState(state));
  } catch {
    return redirectBack(res, "error");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri || !isAdminConfigured()) {
    return redirectBack(res, "unconfigured");
  }

  try {
    const tokens = await exchangeCode({ clientId, clientSecret, redirectUri, code });
    if (!tokens.refresh_token) {
      // Google only returns refresh_token on first consent; prompt=consent forces it.
      return redirectBack(res, "norefresh");
    }
    const db = getAdminDb();
    await db.collection("google_tokens").doc(uid).set(
      {
        userId: uid,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope || "",
        connected_at: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      },
      { merge: true }
    );
    return redirectBack(res, "connected");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return redirectBack(res, "error");
  }
}
