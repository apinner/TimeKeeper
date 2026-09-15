import { beforeAll, describe, expect, it } from "vitest";
import {
  checkPasswordStrength,
  decryptSecret,
  encryptSecret,
  hashPassword,
  isEncrypted,
  verifyPassword,
} from "@/lib/crypto";

beforeAll(() => {
  process.env.AUTH_SECRET = "a-test-secret-used-only-by-the-suite";
});

describe("stored secrets", () => {
  it("round-trips a value", () => {
    const encrypted = encryptSecret("service-account-password");
    expect(encrypted).not.toContain("service-account-password");
    expect(decryptSecret(encrypted)).toBe("service-account-password");
  });

  it("produces a different ciphertext each time", () => {
    expect(encryptSecret("same input")).not.toBe(encryptSecret("same input"));
  });

  it("refuses to decrypt tampered or foreign values", () => {
    const encrypted = encryptSecret("secret");
    const [version, iv, tag, payload] = encrypted.split(".");
    const tampered = [version, iv, tag, Buffer.from("elsewhere").toString("base64")].join(".");

    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret("not-encrypted-at-all")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
    expect(payload).toBeTruthy();
  });

  it("returns null rather than throwing when the key has changed", () => {
    const encrypted = encryptSecret("secret");
    process.env.AUTH_SECRET = "a-completely-different-secret";
    expect(decryptSecret(encrypted)).toBeNull();
    process.env.AUTH_SECRET = "a-test-secret-used-only-by-the-suite";
  });

  it("recognises its own format without decrypting", () => {
    expect(isEncrypted(encryptSecret("x"))).toBe(true);
    expect(isEncrypted("plain text")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});

describe("administrator passwords", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("Correct horse battery staple", hash)).toBe(false);
    expect(verifyPassword("", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently", () => {
    expect(hashPassword("repeated password")).not.toBe(hashPassword("repeated password"));
  });

  it("never treats a missing or malformed hash as a match", () => {
    expect(verifyPassword("anything", null)).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
    expect(verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(verifyPassword("anything", "scrypt.16384.bad.bad")).toBe(false);
  });
});

describe("password strength", () => {
  it("asks for length above all", () => {
    expect(checkPasswordStrength("short").ok).toBe(false);
    expect(checkPasswordStrength("a reasonably long passphrase").ok).toBe(true);
  });

  it("rejects the obvious", () => {
    expect(checkPasswordStrength("aaaaaaaaaaaaaaa").ok).toBe(false);
    expect(checkPasswordStrength("MyPassword123456").ok).toBe(false);
    expect(checkPasswordStrength("timekeeper-admin-1").ok).toBe(false);
  });
});
