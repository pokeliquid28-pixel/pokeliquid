import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { emailExists, createResetToken } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Always return success to avoid leaking which emails exist
    const exists = await emailExists(email);
    if (exists) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await createResetToken(email, token, expiresAt);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app-two-green-66.vercel.app";
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      // Send email via Resend
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Pokeliquid <noreply@pokeliquid.xyz>",
            to: email,
            subject: "Reset your Pokeliquid password",
            html: `
              <div style="font-family: monospace; max-width: 480px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #00ff88;">Pokeliquid Password Reset</h2>
                <p>Click the link below to reset your password. This link expires in 1 hour.</p>
                <p><a href="${resetUrl}" style="color: #00ff88; font-weight: bold;">Reset Password</a></p>
                <p style="font-size: 12px; color: #888;">If you didn't request this, you can safely ignore this email.</p>
                <p style="font-size: 10px; color: #666;">DEVNET ONLY — NOT REAL MONEY</p>
              </div>
            `,
          }),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("forgot-password error:", e);
    return NextResponse.json({ success: true }); // Don't leak errors
  }
}
