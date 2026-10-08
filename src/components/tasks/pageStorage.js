// Page persistence limits and image repair.
//
// A page is one Firestore document, capped at 1 MiB. Whiteboard images used to be
// stored as base64 data URIs *inside* the board JSON, so one or two pasted
// screenshots pushed the write past that cap. The write was rejected, the error was
// swallowed at the call site, and the optimistic cache kept the editing device
// looking saved — so the same page opened on a phone was missing the image and every
// edit made after it. Images now upload to Storage and only the URL is persisted;
// boards saved under the old scheme are repaired the first time they're opened.

// Firestore's real cap is 1,048,576 bytes and counts field names plus UTF-8 bytes,
// so refuse well short of it rather than at the nominal limit.
export const WB_MAX_CHARS = 900000;

export function isDataImageUri(s) {
  return typeof s === "string" && /^data:image\//i.test(s);
}

// Turn a data URI back into a File so it can go through the normal upload path.
export function dataUriToFile(uri, name = "image") {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(uri || "");
  if (!m) throw new Error("not a data URI");
  const type = m[1];
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = (type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
  return new File([bytes], /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${ext}`, { type });
}

const TEXT_IMG_RE = /<img\b[^>]*?\bsrc="(data:image\/[^"]+)"/gi;

// Does this board still carry any inline image bytes (as an image object's src, or
// inside a text box's HTML)?
export function hasDataImage(objects) {
  if (!Array.isArray(objects)) return false;
  return objects.some((o) => {
    if (!o || typeof o !== "object") return false;
    if (isDataImageUri(o.src)) return true;
    return typeof o.text === "string" && /<img\b[^>]*?\bsrc="data:image\//i.test(o.text);
  });
}

// Rewrite a board with an already-resolved data URI -> storage URL map. Separate from
// the uploading so the result can be applied to whatever the board looks like *now*,
// which may not be the snapshot the uploads started from.
export function rewriteBoardImages(objects, replacements) {
  if (!Array.isArray(objects) || !replacements || replacements.size === 0) {
    return { objects, changed: false };
  }
  let changed = false;
  const next = objects.map((o) => {
    if (!o || typeof o !== "object") return o;
    let obj = o;
    const mapped = replacements.get(o.src);
    if (mapped) { obj = { ...obj, src: mapped }; changed = true; }
    if (typeof obj.text === "string" && /data:image\//i.test(obj.text)) {
      let text = obj.text;
      for (const [uri, url] of replacements) {
        if (text.includes(uri)) text = text.split(uri).join(url);
      }
      if (text !== obj.text) { obj = { ...obj, text }; changed = true; }
    }
    return obj;
  });
  return { objects: changed ? next : objects, changed };
}

// Lift every inline data URI out to Storage. `upload(file) => url`. An upload that
// fails leaves its object exactly as it was — better a board that still saves the old
// way than one with a blanked-out image. `replacements` holds only the successes, so a
// caller whose board has moved on can apply them with rewriteBoardImages.
export async function migrateBoardImages(objects, upload) {
  if (!Array.isArray(objects)) {
    return { objects, migrated: 0, failed: 0, changed: false, replacements: new Map() };
  }
  const seen = new Map();
  let migrated = 0;
  let failed = 0;
  const resolve = async (uri) => {
    if (seen.has(uri)) return seen.get(uri);
    let url = null;
    try {
      const out = await upload(dataUriToFile(uri));
      if (typeof out === "string" && out && !isDataImageUri(out)) url = out;
    } catch { url = null; }
    seen.set(uri, url);
    return url;
  };
  const next = [];
  for (const o of objects) {
    if (!o || typeof o !== "object") { next.push(o); continue; }
    let obj = o;
    if (isDataImageUri(o.src)) {
      const url = await resolve(o.src);
      if (url) { obj = { ...obj, src: url }; migrated++; } else failed++;
    }
    if (typeof obj.text === "string" && /data:image\//i.test(obj.text)) {
      const uris = [...new Set([...obj.text.matchAll(TEXT_IMG_RE)].map((m) => m[1]))];
      let text = obj.text;
      for (const uri of uris) {
        const url = await resolve(uri);
        if (url) { text = text.split(uri).join(url); migrated++; } else failed++;
      }
      if (text !== obj.text) obj = { ...obj, text };
    }
    next.push(obj);
  }
  const changed = next.some((o, i) => o !== objects[i]);
  const replacements = new Map();
  for (const [uri, url] of seen) if (url) replacements.set(uri, url);
  return { objects: changed ? next : objects, migrated, failed, changed, replacements };
}

// What to tell the user when a page write is rejected. Firestore reports an oversized
// document as invalid-argument, which is worth translating — it's the one failure the
// user can actually act on.
export function saveFailMessage(err) {
  const s = `${err?.code || ""} ${err?.message || err || ""}`;
  if (/longer than|exceeds the maximum|1048576|1048487|invalid-argument/i.test(s)) {
    return "This page is too large to save (a page can hold about 1 MB). An image probably didn't upload — remove the last image you added, then retry.";
  }
  if (/permission|unauthenticated/i.test(s)) {
    return "Couldn't save — you may have been signed out. Sign in again, then retry.";
  }
  return "Couldn't save — your latest changes are not on the server yet, so they won't show up on your other devices.";
}
