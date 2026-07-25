// Firebase ID token verification WITHOUT a service-account secret.
// Verifies the RS256 JWT from the `Authorization: Bearer <token>` header against
// Google's public keys, checking signature, `aud`, `iss`, and expiry.
//
// No secrets are required or committed — verification relies only on Google's
// published public JWK set for the Firebase Secure Token service.
import { createRemoteJWKSet, jwtVerify } from "jose";

// Firebase projectId (see src/api/firebase.js). Firebase ID tokens are signed
// with `aud === projectId` and `iss === https://securetoken.google.com/<projectId>`.
const PROJECT_ID = "signal-54014";
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

// Google's public keys for the Firebase Secure Token service, served as a JWK set.
// createRemoteJWKSet caches the key set and refreshes it (respecting cache headers)
// so we do not fetch on every request.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

// Extract the bearer token from the Authorization header.
function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

// Verify a Firebase ID token from the incoming request.
// Returns { uid, email } on success; throws on any failure.
export async function verifyAuth(req) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing bearer token");

  // jwtVerify checks the RS256 signature against the remote JWK set, and
  // enforces issuer, audience, and expiry (`exp`). Firebase also sets `iat`/`auth_time`.
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: PROJECT_ID,
    algorithms: ["RS256"],
  });

  // `sub` is the Firebase user uid for ID tokens.
  const uid = payload.sub;
  if (!uid) throw new Error("Token missing subject (uid)");

  return { uid, email: payload.email };
}

export default verifyAuth;
