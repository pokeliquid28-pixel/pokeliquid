import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { getWalletByToken, markTokenUsed } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const encryptionSecret = process.env.EMAIL_ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 503 }
      );
    }

    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { error: "Token required" },
        { status: 400 }
      );
    }

    const wallet = await getWalletByToken(token);
    if (!wallet) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 404 }
      );
    }

    // Decrypt the private key
    const privateKey = decrypt(wallet.encryptedKey, encryptionSecret);

    // Mark token as used (one-time use)
    await markTokenUsed(token);

    return NextResponse.json({ privateKey });
  } catch (e: any) {
    console.error("recover-wallet error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Recovery failed" },
      { status: 500 }
    );
  }
}
