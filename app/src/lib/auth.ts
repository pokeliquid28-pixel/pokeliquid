import bcrypt from "bcryptjs";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

// ── Bcrypt password hashing ─────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  storedHash: string,
  password: string
): Promise<boolean> {
  // Bcrypt hashes start with "$2a$" or "$2b$"
  if (storedHash.startsWith("$2")) {
    return bcrypt.compare(password, storedHash);
  }

  // Argon2 hashes (from previous deployment) — can't verify without native module,
  // user must reset password
  if (storedHash.startsWith("$argon2")) {
    return false;
  }

  // Legacy PBKDF2-SHA512 migration path (format: "hash:salt")
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [hash, salt] = parts;
  const computed = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, "sha512")
    .toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(hash, "hex")
  );
}

/** Returns true if the hash is not bcrypt and should be re-hashed */
export function isLegacyHash(storedHash: string): boolean {
  return !storedHash.startsWith("$2");
}

// ── JWT session tokens ──────────────────────────────────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: {
  userId: number;
  email: string;
  walletPubkey: string | null;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string
): Promise<{ userId: number; email: string; walletPubkey: string | null } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as any;
  } catch {
    return null;
  }
}

/** Read session cookie from request */
export function getSessionCookie(req: NextRequest): string | null {
  return req.cookies.get("session")?.value ?? null;
}

/** Create a Set-Cookie header for the session JWT */
export function sessionCookieHeader(jwt: string): string {
  const maxAge = 30 * 24 * 60 * 60; // 30 days
  return `session=${jwt}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Path=/`;
}

/** Create a clear-cookie header */
export function clearSessionCookieHeader(): string {
  return "session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/";
}
