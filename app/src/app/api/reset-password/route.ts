import { NextRequest, NextResponse } from "next/server";
import { getAccountByEmail, updatePasswordHash } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
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

    const valid = await verifyPassword(account.passwordHash, currentPassword);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const newHash = await hashPassword(newPassword);
    await updatePasswordHash(account.id, newHash);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("reset-password error:", e);
    return NextResponse.json({ error: e?.message ?? "Password reset failed" }, { status: 500 });
  }
}
