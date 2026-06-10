import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { createAccount, emailExists } from "@/lib/db";
import { hashPassword, createSessionToken, sessionCookieHeader } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const encryptionSecret = process.env.EMAIL_ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const { email, password, privateKey, publicKey, referrer } = await req.json();

    if (!email || !password || !privateKey || !publicKey) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    if (await emailExists(email)) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const encryptedKey = encrypt(privateKey, encryptionSecret);
    const userId = await createAccount(email, passwordHash, encryptedKey, publicKey, referrer);

    const jwt = await createSessionToken({ userId, email, walletPubkey: publicKey });

    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", sessionCookieHeader(jwt));
    return res;
  } catch (e: any) {
    console.error("signup error:", e);
    return NextResponse.json({ error: e?.message ?? "Signup failed" }, { status: 500 });
  }
}
