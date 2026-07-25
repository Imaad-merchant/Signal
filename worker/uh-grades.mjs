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
// `uh` in your config: loginUrl, gradesUrl, and the CSS selectors for the username
// field, password field, submit button, and the grade rows. Returns
// [{ course, assignment, score, max }] for the worker to push to /api/ingest.

export async function scrapeGrades(uh) {
  if (!uh || !uh.enabled) return [];
  const missing = ["loginUrl", "gradesUrl", "username", "password", "selectors"].filter((k) => !uh[k]);
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

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(uh.loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const sel = uh.selectors;
    await page.fill(sel.username, uh.username);
    await page.fill(sel.password, uh.password);
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {}),
      page.click(sel.submit),
    ]);

    await page.goto(uh.gradesUrl, { waitUntil: "networkidle", timeout: 30000 });

    // Extract grade rows. `sel.row` selects each row; `sel.course` / `sel.assignment`
    // / `sel.score` / `sel.max` are selectors RELATIVE to a row.
    const grades = await page.$$eval(sel.row, (rows, s) =>
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

    return grades.filter((g) => g.course && Number.isFinite(g.score));
  } catch (err) {
    console.warn("[uh-grades] scrape failed:", err.message);
    return [];
  } finally {
    await browser.close();
  }
}
