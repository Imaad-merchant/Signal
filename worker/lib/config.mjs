// Load the worker config, supporting an ENCRYPTED config at rest.
//
// Two forms are accepted:
//   worker/config.json      — plaintext (fine for a locked-down personal machine)
//   worker/config.json.enc  — AES-256-GCM, unlocked with SIGNAL_WORKER_PASSPHRASE
//
// Encrypt one with:  node encrypt-config.mjs config.json
// Secrets (deviceToken, UH credentials) therefore never sit in plaintext unless
// you choose the plaintext form.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDecipheriv, scryptSync } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Derive a 32-byte key from the passphrase + salt (scrypt).
function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, 32);
}

export function decryptConfig(buf, passphrase) {
  // Layout: salt(16) | iv(12) | authTag(16) | ciphertext
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const tag = buf.subarray(28, 44);
  const data = buf.subarray(44);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(out.toString("utf8"));
}

export function loadConfig() {
  const encPath = join(ROOT, "config.json.enc");
  const plainPath = join(ROOT, "config.json");

  if (existsSync(encPath)) {
    const pass = process.env.SIGNAL_WORKER_PASSPHRASE;
    if (!pass) throw new Error("config.json.enc found but SIGNAL_WORKER_PASSPHRASE is not set");
    return decryptConfig(readFileSync(encPath), pass);
  }
  if (existsSync(plainPath)) {
    return JSON.parse(readFileSync(plainPath, "utf8"));
  }
  throw new Error("No config found — copy config.example.json to config.json (or encrypt it to config.json.enc)");
}
