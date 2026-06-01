import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, verifySessionToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const token = getSessionCookie(req);
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    return NextResponse.json({
      userId: session.userId,
      email: session.email,
      walletPubkey: session.walletPubkey,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
}
