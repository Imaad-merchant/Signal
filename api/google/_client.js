// Minimal Google REST helpers (no `googleapis` dependency — raw fetch keeps
// serverless cold starts light). Covers exactly what the poller needs:
//   - OAuth token exchange + refresh
//   - Gmail: list recent important messages + fetch subject/from/snippet
//   - Drive: list recently modified files
//   - Calendar: list today's events
//
// Scopes requested (read-only): gmail.readonly, drive.metadata.readonly,
// calendar.readonly, plus userinfo.email for account labelling.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Build the consent-screen URL. `state` is our signed uid (see oauth-start).
export function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent", // force a refresh_token on re-consent
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Exchange an authorization code for tokens (includes refresh_token first time).
export async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

// Trade a stored refresh_token for a fresh access_token.
export async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.access_token;
}

async function gapi(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

// Recent important/unread Gmail messages → [{ id, subject, from, snippet, date }]
export async function listImportantMail(accessToken, max = 8) {
  const q = encodeURIComponent("is:unread (is:important OR category:primary) newer_than:2d");
  const list = await gapi(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${q}`,
    accessToken
  );
  const ids = (list.messages || []).map((m) => m.id);
  const out = [];
  for (const id of ids) {
    try {
      const msg = await gapi(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        accessToken
      );
      const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
      out.push({
        id,
        subject: headers.subject || "(no subject)",
        from: headers.from || "",
        snippet: msg.snippet || "",
        date: headers.date || "",
      });
    } catch { /* skip a message that fails to fetch */ }
  }
  return out;
}

// Recently modified Drive files → [{ id, name, mimeType, modifiedTime, link }]
export async function listRecentDriveFiles(accessToken, max = 6) {
  const params = new URLSearchParams({
    pageSize: String(max),
    orderBy: "modifiedTime desc",
    q: "trashed = false",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
  });
  const data = await gapi(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, accessToken);
  return (data.files || []).map((f) => ({
    id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, link: f.webViewLink || "",
  }));
}

// Today's calendar events → [{ id, summary, start, end, link }]
export async function listTodayEvents(accessToken, timeZone = "America/Chicago", max = 10) {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(max),
    timeZone,
  });
  const data = await gapi(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    accessToken
  );
  return (data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary || "(busy)",
    start: e.start?.dateTime || e.start?.date || "",
    end: e.end?.dateTime || e.end?.date || "",
    link: e.htmlLink || "",
  }));
}
