import { NextRequest, NextResponse } from "next/server";
import { getReferrerByPublicKey } from "@/lib/db";

export async function GET(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get("publicKey");
  if (!publicKey) {
    return NextResponse.json({ referrer: null });
  }
  try {
    const referrer = await getReferrerByPublicKey(publicKey);
    return NextResponse.json({ referrer });
  } catch {
    return NextResponse.json({ referrer: null });
  }
}
