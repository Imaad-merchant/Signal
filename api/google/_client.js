// Minimal Google REST helpers (no `googleapis` dependency — raw fetch keeps
// serverless cold starts light). Covers exactly what the poller needs:
//   - OAuth token exchange + refresh
//   - Gmail: list recent important messages + fetch subject/from/snippet
//   - Drive: list recently modified files
//   - Calendar: list today's events
//
// Scopes requested (read-only): gmail.readonly (message bodies), drive.readonly
// (search + export Docs/Slides as text), calendar.readonly, plus userinfo.email.
// Note: drive.readonly (not drive.metadata.readonly) is required to read file
// content — the user re-consents once after this ships.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  // calendar.events = read + write events (two-way sync). Re-consent once after this.
  "https://www.googleapis.com/auth/calendar.events",
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
async function gapiText(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.text();
}

function b64urlDecode(data) {
  try {
    return Buffer.from(String(data || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch { return ""; }
}
// Walk a Gmail payload tree for the best text body (prefer text/plain, else strip HTML).
function extractBody(payload) {
  if (!payload) return "";
  const stack = [payload];
  let html = "";
  while (stack.length) {
    const p = stack.shift();
    const mime = p.mimeType || "";
    if (mime === "text/plain" && p.body?.data) return b64urlDecode(p.body.data).trim();
    if (mime === "text/html" && p.body?.data && !html) html = b64urlDecode(p.body.data);
    if (Array.isArray(p.parts)) stack.push(...p.parts);
  }
  return html ? html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "";
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

// Upcoming calendar events from now through `days` ahead → [{ id, summary, start, end, link }]
// (Was today-only; widened so the assistant can answer "what's on next week".)
export async function listUpcomingEvents(accessToken, days = 14, timeZone = "America/Chicago", max = 40) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
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

// --- Calendar write (two-way sync). App events are all-day on a YYYY-MM-DD date. ---
async function gapiWrite(method, url, accessToken, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.status === 204 ? {} : res.json();
}
function addDay(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// Create an all-day event; returns the new event id.
export async function insertEvent(accessToken, { title, date }) {
  const data = await gapiWrite("POST", "https://www.googleapis.com/calendar/v3/calendars/primary/events", accessToken, {
    summary: title || "(untitled)", start: { date }, end: { date: addDay(date) },
  });
  return data.id;
}
// Update an existing event's title and/or date.
export async function patchEvent(accessToken, eventId, { title, date }) {
  const body = {};
  if (title != null) body.summary = title;
  if (date) { body.start = { date }; body.end = { date: addDay(date) }; }
  return gapiWrite("PATCH", `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, accessToken, body);
}
// Delete an event (already-gone is treated as success).
export async function deleteEvent(accessToken, eventId) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return true;
}
// List events for incremental sync. With a syncToken, returns only changes (incl.
// cancellations); otherwise a time-window snapshot. Returns { items, nextPageToken,
// nextSyncToken }. Throws an error with .code=410 when the syncToken has expired.
export async function listEventsForSync(accessToken, { syncToken, timeMin, timeMax, pageToken } = {}) {
  const params = new URLSearchParams({ singleEvents: "true", maxResults: "250", showDeleted: "true" });
  if (syncToken) params.set("syncToken", syncToken);
  else { if (timeMin) params.set("timeMin", timeMin); if (timeMax) params.set("timeMax", timeMax); }
  if (pageToken) params.set("pageToken", pageToken);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 410) { const e = new Error("sync token expired"); e.code = 410; throw e; }
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

// --- Live, on-demand reads for the voice assistant ---

// Search Gmail and fetch FULL messages (subject/from/date + decoded body).
// query is a Gmail search string (e.g. "from:professor", "in:inbox newer_than:7d").
export async function searchMail(accessToken, query, max = 6) {
  const q = encodeURIComponent(query || "in:inbox");
  const list = await gapi(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${q}`,
    accessToken
  );
  const ids = (list.messages || []).map((m) => m.id);
  const out = [];
  for (const id of ids) {
    try {
      const msg = await gapi(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, accessToken);
      const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
      out.push({
        id,
        subject: headers.subject || "(no subject)",
        from: headers.from || "",
        date: headers.date || "",
        snippet: msg.snippet || "",
        body: extractBody(msg.payload).slice(0, 4000),
      });
    } catch { /* skip a message that fails */ }
  }
  return out;
}

// Search Drive by name/fullText, optionally restricted to Docs or Slides.
// kind: "doc" | "slides" | "any". Returns [{ id, name, mimeType, link }].
export async function searchDrive(accessToken, query, kind = "any", max = 6) {
  const term = String(query || "").replace(/['\\]/g, " ").trim();
  const mime = kind === "doc" ? "application/vnd.google-apps.document"
    : kind === "slides" ? "application/vnd.google-apps.presentation" : "";
  const clauses = ["trashed = false"];
  if (term) clauses.push(`(name contains '${term}' or fullText contains '${term}')`);
  if (mime) clauses.push(`mimeType = '${mime}'`);
  const params = new URLSearchParams({
    pageSize: String(max),
    orderBy: "modifiedTime desc",
    q: clauses.join(" and "),
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
  });
  const data = await gapi(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, accessToken);
  return (data.files || []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, link: f.webViewLink || "" }));
}

// Export a Google Doc or Slides deck as plain text.
export async function exportFileText(accessToken, fileId, max = 8000) {
  const text = await gapiText(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
    accessToken
  );
  return String(text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
