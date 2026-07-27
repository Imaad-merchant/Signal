// ⚠️  OPT-IN, LOCAL-ONLY UH grades scraper.  ⚠️
//
// This runs ENTIRELY on your machine, with YOUR credentials, from an encrypted
// local config. Nothing about your university login ever touches the cloud.
//
// READ THIS FIRST:
//   Automating a login to a university portal very likely violates that portal's
//   Terms of Service and your university's IT/acceptable-use policy. You are doing
//   this to your OWN account, at your OWN risk. The recommended path is still
//   MANUAL PASTE (just read your grades to the orb) — zero credentials, no ToS
//   grey area. This module is disabled unless you explicitly set uh.enabled=true.
//
// It uses Playwright, which is an OPTIONAL dependency — install it only if you opt
// in:  npm install playwright  (then `npx playwright install chromium`).
//
// Because every portal's markup differs, the selectors are config-driven. Fill in
// `uh` in your config: loginUrl, the grade page(s), and the CSS selectors. Returns
// [{ course, assignment, score, max }] for the worker to push to /api/ingest.
//
// Brightspace (D2L) note: grades live on a SEPARATE page PER COURSE, so give
// `gradesUrls` — one per-course "My Grades" URL — instead of a single `gradesUrl`.
// On each page `sel.pageCourse` reads the course title once (used when a row has no
// course of its own). Single-portal sites can still use one `gradesUrl`.
//
// 2FA: if the portal emails a one-time code, set `sel.otpInput` (+ optional
// `sel.otpSubmit` / `sel.trustDevice`) and an `otp` block; the code is read from
// Gmail via otp-gmail.mjs. Tick "trust this device" to skip the code on later runs.
import { getGmailOtp } from "./otp-gmail.mjs";

export async function scrapeGrades(uh) {
  if (!uh || !uh.enabled) return [];
  const urls = Array.isArray(uh.gradesUrls) && uh.gradesUrls.length
    ? uh.gradesUrls
    : (uh.gradesUrl ? [uh.gradesUrl] : []);
  const missing = ["loginUrl", "username", "password", "selectors"].filter((k) => !uh[k]);
  if (!urls.length) missing.push("gradesUrls");
  if (missing.length) {
    console.warn("[uh-grades] disabled — missing config:", missing.join(", "));
    return [];
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.warn("[uh-grades] playwright not installed — run `npm install playwright` to enable.");
    return [];
  }

  const sel = uh.selectors;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(uh.loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Log in (Pioneer Portal / SSO). After submit, wait for the redirect chain to settle.
    await page.fill(sel.username, uh.username);
    await page.fill(sel.password, uh.password);
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {}),
      page.click(sel.submit),
    ]);

    // 2FA: if a one-time-code field appears, fetch the code from Gmail and enter it.
    if (sel.otpInput && uh.otp?.enabled) {
      const needsCode = await page.waitForSelector(sel.otpInput, { timeout: 12000 }).then(() => true).catch(() => false);
      if (needsCode) {
        const code = await getGmailOtp(uh.otp);
        if (code) {
          await page.fill(sel.otpInput, code);
          if (sel.trustDevice) await page.click(sel.trustDevice).catch(() => {}); // "remember this device" → skip code next time
          await Promise.all([
            page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {}),
            sel.otpSubmit ? page.click(sel.otpSubmit).catch(() => {}) : page.keyboard.press("Enter").catch(() => {}),
          ]);
        } else {
          console.warn("[uh-grades] a login code was required but none was read from Gmail — check the otp config.");
        }
      }
    }

    const all = [];
    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        // The course title for this page (Brightspace shows it in a header).
        const pageCourse = sel.pageCourse
          ? await page.$eval(sel.pageCourse, (el) => el.textContent.trim()).catch(() => "")
          : "";
        // `sel.row` selects each row; course/assignment/score/max are RELATIVE to a row.
        const rows = await page.$$eval(sel.row, (rows, s) =>
          rows.map((r) => {
            const pick = (q) => (q && r.querySelector(q) ? r.querySelector(q).textContent.trim() : "");
            return {
              course: pick(s.course),
              assignment: pick(s.assignment),
              score: parseFloat(pick(s.score)),
              max: s.max ? parseFloat(pick(s.max)) : null,
            };
          }), sel
        );
        for (const g of rows) {
          if (!g.course) g.course = pageCourse;
          all.push(g);
        }
      } catch (err) {
        console.warn(`[uh-grades] page failed (${url}):`, err.message);
      }
    }

    return all.filter((g) => g.course && Number.isFinite(g.score));
  } catch (err) {
    console.warn("[uh-grades] scrape failed:", err.message);
    return [];
  } finally {
    await browser.close();
  }
}
