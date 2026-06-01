import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { decrypt, encrypt } from "@/lib/crypto";
import { getAccountByEmail } from "@/lib/db";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: (process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || "")
    .replace(/[?&]sslmode=[^&]*/g, "")
    .replace(/[?&]supa=[^&]*/g, ""),
  ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : false,
});

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex") + ":" + salt;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [hash, salt] = parts;
  const computed = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
}

export async function POST(req: NextRequest) {
  try {
    const encryptionSecret = process.env.EMAIL_ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const { email, currentPassword, newPassword } = await req.json();

    if (!email || !currentPassword || !newPassword) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }

    const account = await getAccountByEmail(email);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!verifyPassword(currentPassword, account.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    // Hash new password
    const salt = crypto.randomBytes(16).toString("hex");
    const newPasswordHash = hashPassword(newPassword, salt);

    // Update in DB
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE wallets SET password_hash = $1 WHERE id = $2`,
        [newPasswordHash, account.id]
      );
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("reset-password error:", e);
    return NextResponse.json({ error: e?.message ?? "Password reset failed" }, { status: 500 });
  }
}
