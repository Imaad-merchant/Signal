#!/usr/bin/env node
// Encrypt a plaintext worker config into config.json.enc (AES-256-GCM).
//
//   SIGNAL_WORKER_PASSPHRASE='a strong passphrase' node encrypt-config.mjs config.json
//
// Then delete the plaintext config.json and run the worker with the same
// SIGNAL_WORKER_PASSPHRASE in its environment.
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, createCipheriv, scryptSync } from "node:crypto";

const inPath = process.argv[2] || "config.json";
const pass = process.env.SIGNAL_WORKER_PASSPHRASE;
if (!pass) {
  console.error("Set SIGNAL_WORKER_PASSPHRASE in the environment first.");
  process.exit(1);
}

const plaintext = readFileSync(inPath, "utf8");
JSON.parse(plaintext); // validate it's JSON before encrypting

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(pass, salt, 32);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();

// Layout: salt(16) | iv(12) | authTag(16) | ciphertext
writeFileSync("config.json.enc", Buffer.concat([salt, iv, tag, enc]));
console.log("Wrote config.json.enc — you can now delete", inPath);
