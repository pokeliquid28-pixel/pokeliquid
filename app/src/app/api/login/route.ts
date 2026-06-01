import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { decrypt } from "@/lib/crypto";
import { getAccountByEmail } from "@/lib/db";

function verifyPassword(password: string, stored: string): boolean {
  const [hash, salt] = stored.split(":").length === 2
    ? [stored.split(":")[0], stored.split(":")[1]]
    : ["", ""];
  if (!salt) return false;
  const computed = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
}

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

    if (!verifyPassword(password, account.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Decrypt the private key
    const privateKey = decrypt(account.encryptedKey, encryptionSecret);

    return NextResponse.json({ privateKey, publicKey: account.publicKey });
  } catch (e: any) {
    console.error("login error:", e);
    return NextResponse.json({ error: e?.message ?? "Login failed" }, { status: 500 });
  }
}
