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
      console.log("Reset token created for:", email);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pokeliquid.xyz";
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      // Send email via Resend
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.error("RESEND_API_KEY not set — cannot send password reset email");
        return NextResponse.json({ success: true });
      }

      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Pokeliquid <onboarding@resend.dev>",
            to: email,
            subject: "Reset your Pokeliquid password",
            html: `
              <div style="font-family: monospace; background: #0a0a0a; color: #ffffff; padding: 40px; max-width: 480px; margin: 0 auto;">
                <h1 style="color: #00ff41; font-size: 24px; margin-bottom: 24px;">Pokeliquid</h1>
                <p style="color: #ccc; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                  Reset your password by clicking the button below. This link expires in 1 hour.
                </p>
                <a href="${resetUrl}"
                   style="background: #00ff41; color: #000; padding: 12px 24px; text-decoration: none;
                          display: inline-block; margin: 20px 0; font-weight: bold; font-family: monospace;">
                  Reset Password
                </a>
                <p style="color: #666; font-size: 12px; line-height: 1.6; margin-top: 32px;">
                  If you didn't request this, you can safely ignore this email.
                </p>
                <p style="color: #444; font-size: 10px; margin-top: 24px; border-top: 1px solid #222; padding-top: 16px;">
                  DEVNET ONLY — NOT REAL MONEY
                </p>
              </div>
            `,
          }),
        });

        const resBody = await emailRes.text();
        if (emailRes.ok) {
          console.log("Resend email sent successfully:", resBody);
        } else {
          console.error("Resend API error:", emailRes.status, resBody);
        }
      } catch (sendErr: any) {
        console.error("Resend fetch error:", sendErr?.message ?? sendErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("forgot-password error:", e);
    return NextResponse.json({ success: true }); // Don't leak errors
  }
}
