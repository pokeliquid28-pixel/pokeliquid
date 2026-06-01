import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;
const KEY_LEN = 32;
const ITERATIONS = 100_000;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LEN, "sha256");
}

/**
 * Encrypt plaintext with AES-256-GCM using EMAIL_ENCRYPTION_SECRET.
 * Output format: base64(salt + iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string, secret: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt ciphertext produced by encrypt().
 */
export function decrypt(encoded: string, secret: string): string {
  const buf = Buffer.from(encoded, "base64");
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/**
 * Generate a cryptographically secure random token (URL-safe).
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
