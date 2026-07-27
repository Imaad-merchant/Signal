// Reads the latest one-time login code from Gmail over IMAP, so the grade scraper
// can clear a portal 2FA prompt on its own. LOCAL-ONLY: your Gmail credentials live
// in the encrypted worker config and never leave your machine.
//
// Requires an OPTIONAL dependency and a Gmail APP PASSWORD (NOT your normal
// password):
//   npm install imapflow
//   Create an app password at https://myaccount.google.com/apppasswords
//   (requires 2-Step Verification on your Google account). Use that 16-char value
//   as `otp.appPassword`.
//
// It polls the inbox for up to `waitSeconds`, looks at the newest few messages that
// match `fromContains` / `subjectContains`, and pulls the code out with `codeRegex`.

export async function getGmailOtp(otp) {
  if (!otp || !otp.enabled) return null;
  const missing = ["user", "appPassword"].filter((k) => !otp[k]);
  if (missing.length) {
    console.warn("[otp-gmail] disabled — missing config:", missing.join(", "));
    return null;
  }

  let ImapFlow;
  try {
    ({ ImapFlow } = await import("imapflow"));
  } catch {
    console.warn("[otp-gmail] imapflow not installed — run `npm install imapflow` to enable OTP.");
    return null;
  }

  const re = new RegExp(otp.codeRegex || "\\b(\\d{4,8})\\b");
  const fromNeedle = (otp.fromContains || "").toLowerCase();
  const subjNeedle = (otp.subjectContains || "").toLowerCase();
  const deadline = Date.now() + (otp.waitSeconds || 30) * 1000;

  const client = new ImapFlow({
    host: otp.imapHost || "imap.gmail.com",
    port: otp.imapPort || 993,
    secure: true,
    auth: { user: otp.user, pass: otp.appPassword },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      while (Date.now() < deadline) {
        const status = await client.status("INBOX", { messages: true });
        const total = status.messages || 0;
        if (total > 0) {
          const start = Math.max(1, total - 5); // newest ~6 messages
          const msgs = [];
          for await (const m of client.fetch(`${start}:*`, { envelope: true, source: true, internalDate: true })) {
            msgs.push(m);
          }
          msgs.sort((a, b) => (b.internalDate?.getTime?.() || 0) - (a.internalDate?.getTime?.() || 0));
          for (const m of msgs) {
            const subject = (m.envelope?.subject || "").toLowerCase();
            const from = (m.envelope?.from?.[0]?.address || "").toLowerCase();
            if (fromNeedle && !from.includes(fromNeedle) && !subject.includes(fromNeedle)) continue;
            if (subjNeedle && !subject.includes(subjNeedle)) continue;
            const body = m.source ? m.source.toString("utf8") : "";
            const match = re.exec(`${subject}\n${body}`);
            if (match) return match[1] || match[0];
          }
        }
        await new Promise((r) => setTimeout(r, 3000)); // the code email may lag a few seconds
      }
      console.warn("[otp-gmail] no matching code found within waitSeconds");
      return null;
    } finally {
      lock.release();
    }
  } catch (err) {
    console.warn("[otp-gmail] failed:", err.message);
    return null;
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}
