// Firestore Point-in-Time Recovery (PITR) — restore accidentally hard-deleted `pages` docs.
//
// Reads the `pages` collection AS OF a past timestamp (PITR), diffs it against the live
// collection, and re-creates any docs that existed then but are gone now — with their
// ORIGINAL document IDs so parent/child (sub-page) links stay intact.
//
// Requires a service-account key for project signal-54014 (Firebase console →
// Project Settings → Service Accounts → Generate new private key). PITR must have been
// enabled BEFORE the deletion; otherwise the read-as-of call fails and nothing is written.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json node scripts/recover-page.mjs            # dry run, 90 min ago
//   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json node scripts/recover-page.mjs --minutes 30
//   GOOGLE_APPLICATION_CREDENTIALS=./sa-key.json node scripts/recover-page.mjs --apply     # actually restore
//
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const minutesIdx = args.indexOf("--minutes");
const MINUTES_AGO = minutesIdx !== -1 ? Number(args[minutesIdx + 1]) : 90;
const keyPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  (args.indexOf("--key") !== -1 ? args[args.indexOf("--key") + 1] : null);

if (!keyPath) {
  console.error(
    "Missing service-account key. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json (or pass --key <path>)."
  );
  process.exit(1);
}
if (!Number.isFinite(MINUTES_AGO) || MINUTES_AGO <= 0) {
  console.error(`Invalid --minutes value: ${args[minutesIdx + 1]}`);
  process.exit(1);
}

// ── init admin ────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id || "signal-54014",
});
const db = getFirestore();

const readTime = Timestamp.fromMillis(Date.now() - MINUTES_AGO * 60 * 1000);

console.log(`Project:   ${serviceAccount.project_id || "signal-54014"}`);
console.log(`Read-time: ${readTime.toDate().toISOString()} (${MINUTES_AGO} min ago)`);
console.log(`Mode:      ${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}`);
console.log("");

// ── read past snapshot (PITR) + live, then diff ─────────────────────────────
let pastSnap;
try {
  // Admin SDK: pass readTime to read the collection as of a past instant.
  pastSnap = await db.collection("pages").get({ readTime });
} catch (err) {
  console.error("Failed to read `pages` as of the past snapshot.");
  console.error("This usually means Point-in-Time Recovery is NOT enabled, or the read-time");
  console.error("is older than the 7-day PITR window. Original error:");
  console.error(`  ${err.message || err}`);
  console.error("");
  console.error("→ If PITR was off, this document cannot be recovered via PITR. Check backups:");
  console.error("  gcloud firestore backups list --project=signal-54014");
  process.exit(2);
}

const liveSnap = await db.collection("pages").get();

const liveIds = new Set(liveSnap.docs.map((d) => d.id));
const deleted = pastSnap.docs.filter((d) => !liveIds.has(d.id));

console.log(`pages then: ${pastSnap.size}   pages now: ${liveSnap.size}   missing: ${deleted.length}`);
console.log("");

if (deleted.length === 0) {
  console.log("No deleted pages found at this read-time.");
  console.log("Try moving the read-time further back, e.g. --minutes 120");
  process.exit(0);
}

for (const d of deleted) {
  const p = d.data();
  console.log(`• id=${d.id}`);
  console.log(`    title:     ${JSON.stringify(p.title ?? "(untitled)")}`);
  console.log(`    icon:      ${p.icon ?? "(none)"}`);
  console.log(`    parent_id: ${p.parent_id ?? "(root)"}`);
  console.log(`    type:      ${p.type ?? "(none)"}   content:${(p.content || "").length}b   whiteboard:${(p.whiteboard || "").length}b`);
}
console.log("");

if (!APPLY) {
  console.log("Dry run only — nothing written. Re-run with --apply to restore the docs above.");
  process.exit(0);
}

// ── restore with original IDs (preserves hierarchy) ─────────────────────────
const batch = db.batch();
for (const d of deleted) {
  batch.set(db.collection("pages").doc(d.id), d.data());
}
await batch.commit();
console.log(`Restored ${deleted.length} page(s) with original IDs. Reload the app to see them.`);
