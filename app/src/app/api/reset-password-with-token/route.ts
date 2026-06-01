import { NextRequest, NextResponse } from "next/server";
import { getResetToken, markResetTokenUsed, getAccountByEmail, updatePasswordHash } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token and new password required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const resetToken = await getResetToken(token);
    if (!resetToken) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    if (resetToken.used) {
      return NextResponse.json({ error: "This reset link has already been used" }, { status: 400 });
    }

    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json({ error: "This reset link has expired" }, { status: 400 });
    }

    const account = await getAccountByEmail(resetToken.email);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const newHash = await hashPassword(newPassword);
    await updatePasswordHash(account.id, newHash);
    await markResetTokenUsed(resetToken.id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("reset-password-with-token error:", e);
    return NextResponse.json({ error: e?.message ?? "Password reset failed" }, { status: 500 });
  }
}
