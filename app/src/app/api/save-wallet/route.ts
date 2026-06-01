import { NextRequest, NextResponse } from "next/server";
import { encrypt, generateToken } from "@/lib/crypto";
import { saveWallet, createRecoveryToken } from "@/lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app-two-green-66.vercel.app";

export async function POST(req: NextRequest) {
  try {
    const encryptionSecret = process.env.EMAIL_ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      return NextResponse.json(
        { error: "Server not configured for wallet saving" },
        { status: 503 }
      );
    }

    const { email, privateKey } = await req.json();

    if (!email || !privateKey) {
      return NextResponse.json(
        { error: "email and privateKey required" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Encrypt the private key
    const encryptedKey = encrypt(privateKey, encryptionSecret);

    // Save to database
    const walletId = await saveWallet(email, encryptedKey);

    // Generate recovery token
    const token = generateToken();
    await createRecoveryToken(walletId, token);

    // Send recovery email
    const recoveryUrl = `${APP_URL}/recover?token=${token}`;
    await sendRecoveryEmail(email, recoveryUrl);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("save-wallet error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to save wallet" },
      { status: 500 }
    );
  }
}

async function sendRecoveryEmail(email: string, recoveryUrl: string) {
  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;

  if (resendKey) {
    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: "Pokeliquid <noreply@pokeliquid.xyz>",
      to: email,
      subject: "Your Pokeliquid wallet",
      html: `
        <div style="font-family: monospace; background: #080B10; color: #e2e8f0; padding: 32px; max-width: 480px;">
          <h2 style="color: #a78bfa; margin-bottom: 16px;">Your Pokeliquid Wallet</h2>
          <p>Click the link below to restore your wallet and positions on any device:</p>
          <a href="${recoveryUrl}"
             style="display: inline-block; margin: 20px 0; padding: 12px 24px; background: linear-gradient(135deg, #ff6ec7, #a78bfa, #38bdf8); color: white; text-decoration: none; font-weight: bold;">
            Restore My Wallet
          </a>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
            This link expires in 24 hours and can only be used once.<br/>
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border-color: #1e2a3a; margin: 24px 0;" />
          <p style="color: #64748b; font-size: 11px;">
            Pokeliquid — Pokemon card perpetual futures on Solana
          </p>
        </div>
      `,
    });
  } else if (sendgridKey) {
    // Sendgrid fallback
    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: "noreply@pokeliquid.xyz", name: "Pokeliquid" },
        subject: "Your Pokeliquid wallet",
        content: [
          {
            type: "text/html",
            value: `<p>Restore your wallet: <a href="${recoveryUrl}">${recoveryUrl}</a></p>
                    <p>This link expires in 24 hours.</p>`,
          },
        ],
      }),
    });
  } else {
    console.warn("No email service configured (RESEND_API_KEY or SENDGRID_API_KEY)");
    // Don't fail — the wallet is still saved in the database
  }
}
