import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Secrets stored in the database — the LDAP service account and SMTP passwords
 * — are encrypted with a key derived from AUTH_SECRET, so a database dump or a
 * nightly backup does not hand over working credentials.
 *
 * This protects the backups, not the running application: anything holding
 * AUTH_SECRET can decrypt. Rotating AUTH_SECRET makes stored secrets
 * unreadable, and they must be re-entered.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_SALT = "timekeeper.secrets.v1";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — secrets cannot be encrypted");
  return scryptSync(secret, KEY_SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

/**
 * Returns null rather than throwing when a value cannot be read, so a rotated
 * AUTH_SECRET degrades to "the password needs re-entering" instead of taking
 * the application down.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;

  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** True when a stored value looks like one of ours, without decrypting it. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("v1.") && value.split(".").length === 4;
}

// ---------------------------------------------------------------------------
// Local administrator passwords
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;

/** scrypt with a per-password salt. Hashes are never decryptable. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST });
  return `scrypt.${SCRYPT_COST}.${salt.toString("base64")}.${derived.toString("base64")}`;
}

/** Constant-time comparison, so a wrong password cannot be found by timing. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;

  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;

  try {
    const cost = Number(parts[1]);
    const salt = Buffer.from(parts[2], "base64");
    const expected = Buffer.from(parts[3], "base64");
    const actual = scryptSync(password, salt, expected.length, { N: cost });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export interface PasswordProblem {
  ok: boolean;
  message?: string;
}

/**
 * Deliberately modest rules. Length does more for a password than forcing a
 * punctuation mark, and rules people resent get worked around.
 */
export function checkPasswordStrength(password: string): PasswordProblem {
  if (password.length < 12) {
    return { ok: false, message: "Use at least 12 characters." };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, message: "That is the same character repeated." };
  }
  const common = ["password", "timekeeper", "administrator", "12345678", "qwerty"];
  if (common.some((word) => password.toLowerCase().includes(word))) {
    return { ok: false, message: "That contains a word which is guessed early in any attack." };
  }
  return { ok: true };
}
