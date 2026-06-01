import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { encrypt } from "@/lib/crypto";
import { createAccount, emailExists } from "@/lib/db";

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex") + ":" + salt;
}

export async function POST(req: NextRequest) {
  try {
    const encryptionSecret = process.env.EMAIL_ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const { email, password, privateKey, publicKey } = await req.json();

    if (!email || !password || !privateKey || !publicKey) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Check if email already exists
    if (await emailExists(email)) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    // Hash password for storage
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);

    // Encrypt private key with server secret
    const encryptedKey = encrypt(privateKey, encryptionSecret);

    await createAccount(email, passwordHash, encryptedKey, publicKey);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("signup error:", e);
    return NextResponse.json({ error: e?.message ?? "Signup failed" }, { status: 500 });
  }
}
