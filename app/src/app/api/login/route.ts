import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { getAccountByEmail, updatePasswordHash } from "@/lib/db";
import {
  verifyPassword,
  isLegacyHash,
  hashPassword,
  createSessionToken,
  sessionCookieHeader,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const encryptionSecret = process.env.EMAIL_ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const account = await getAccountByEmail(email);
    if (!account) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await verifyPassword(account.passwordHash, password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Migrate legacy hash to bcrypt on successful login
    if (isLegacyHash(account.passwordHash)) {
      const newHash = await hashPassword(password);
      await updatePasswordHash(account.id, newHash);
    }

    const privateKey = decrypt(account.encryptedKey, encryptionSecret);
    const jwt = await createSessionToken({
      userId: account.id,
      email,
      walletPubkey: account.publicKey,
    });

    const res = NextResponse.json({ privateKey, publicKey: account.publicKey });
    res.headers.set("Set-Cookie", sessionCookieHeader(jwt));
    return res;
  } catch (e: any) {
    console.error("login error:", e);
    return NextResponse.json({ error: e?.message ?? "Login failed" }, { status: 500 });
  }
}
