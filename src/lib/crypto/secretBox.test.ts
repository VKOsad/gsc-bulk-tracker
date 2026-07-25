import { describe, it, expect, beforeAll } from "vitest";
import { sealSecret, openSecret, maskSecret, isEncryptionConfigured } from "./secretBox";

const KEY_A = "a".repeat(64); // 32 bytes hex
const KEY_B = "b".repeat(64);

beforeAll(() => {
  process.env.TOPVISOR_ENCRYPTION_KEY = KEY_A;
});

describe("secretBox AES-256-GCM", () => {
  it("round-trips a secret", () => {
    const sealed = sealSecret("dcefda56ce3a340a18972fc00661b163");
    expect(sealed.ciphertext).not.toContain("dcefda"); // ciphertext is not the plaintext
    expect(openSecret(sealed)).toBe("dcefda56ce3a340a18972fc00661b163");
  });

  it("produces a fresh IV each time (non-deterministic ciphertext)", () => {
    const a = sealSecret("same");
    const b = sealSecret("same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(openSecret(a)).toBe("same");
    expect(openSecret(b)).toBe("same");
  });

  it("fails to open with the wrong key", () => {
    const sealed = sealSecret("secret");
    process.env.TOPVISOR_ENCRYPTION_KEY = KEY_B;
    expect(() => openSecret(sealed)).toThrow();
    process.env.TOPVISOR_ENCRYPTION_KEY = KEY_A;
  });

  it("fails to open a tampered ciphertext (GCM auth tag)", () => {
    const sealed = sealSecret("secret");
    const bad = { ...sealed, ciphertext: Buffer.from("tampered").toString("base64") };
    expect(() => openSecret(bad)).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    process.env.TOPVISOR_ENCRYPTION_KEY = "short";
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => sealSecret("x")).toThrow(/32 bytes/);
    process.env.TOPVISOR_ENCRYPTION_KEY = KEY_A;
    expect(isEncryptionConfigured()).toBe(true);
  });

  it("masks secrets for display", () => {
    expect(maskSecret("dcefda56ce3a340a18972fc00661b163")).toBe("dce••••••63");
    expect(maskSecret("abc")).toBe("•••");
    expect(maskSecret("")).toBe("");
  });
});
