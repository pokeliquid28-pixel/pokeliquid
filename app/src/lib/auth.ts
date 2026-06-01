import argon2 from "argon2";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

// ── Argon2id password hashing ───────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64MB
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(
  storedHash: string,
  password: string
): Promise<boolean> {
  // Legacy PBKDF2 hashes are "hex:hex" format, argon2 hashes start with "$argon2"
  if (storedHash.startsWith("$argon2")) {
    return argon2.verify(storedHash, password);
  }

  // Legacy PBKDF2-SHA512 migration path
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

/** Returns true if the hash is legacy PBKDF2 and should be re-hashed with argon2 */
export function isLegacyHash(storedHash: string): boolean {
  return !storedHash.startsWith("$argon2");
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
