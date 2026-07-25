// AES-256-GCM sealed-secret helper — SERVER ONLY (uses node:crypto).
// Used to encrypt the Topvisor API key at rest (TopvisorConnection.encryptedApiKey).
// The key material comes from TOPVISOR_ENCRYPTION_KEY and never leaves the server;
// a sealed secret is only ever opened inside a server-side call.
//
// TOPVISOR_ENCRYPTION_KEY must decode to exactly 32 bytes. Generate one with:
//     openssl rand -hex 32      (64 hex chars)  ← recommended
//   or a 32-byte base64 value.

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the standard for GCM

export interface SealedSecret {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

function loadKey(): Buffer {
  const raw = process.env.TOPVISOR_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) {
    throw new Error("TOPVISOR_ENCRYPTION_KEY is not set");
  }
  const value = raw.trim();
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    // Fall back to base64 (accept 32-byte base64 keys too).
    try {
      key = Buffer.from(value, "base64");
    } catch {
      key = Buffer.alloc(0);
    }
  }
  if (key.length !== 32) {
    throw new Error(
      "TOPVISOR_ENCRYPTION_KEY must decode to 32 bytes (use `openssl rand -hex 32`)",
    );
  }
  return key;
}

/** True if a valid 32-byte encryption key is configured (used to gate the feature/UI). */
export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a UTF-8 secret. Returns base64 ciphertext + iv + GCM auth tag. */
export function sealSecret(plaintext: string): SealedSecret {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/** Decrypt a sealed secret. Throws if the key is wrong or the ciphertext was tampered with. */
export function openSecret(sealed: SealedSecret): string {
  const key = loadKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** Mask a secret for safe display/logging: keep first 3 + last 2 chars. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(6)}${value.slice(-2)}`;
}
