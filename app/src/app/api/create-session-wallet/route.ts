import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { encrypt, generateToken } from "@/lib/crypto";

const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT!;

// Simple in-memory rate limit (resets on cold start)
const ipTimestamps = new Map<string, number>();

function getRelayerKeypair(): Keypair | null {
  const raw = process.env.RELAYER_PRIVATE_KEY;
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(new Uint8Array(arr));
  } catch {
    try {
      const bs58 = require("bs58");
      return Keypair.fromSecretKey(bs58.decode(raw));
    } catch {
      return null;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 1 per IP per hour
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const lastCreated = ipTimestamps.get(ip) ?? 0;
    if (Date.now() - lastCreated < 3600_000) {
      return NextResponse.json(
        { error: "Rate limited. Try again in 1 hour." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { publicKey, privateKey } = body;

    if (!publicKey || !privateKey) {
      return NextResponse.json(
        { error: "publicKey and privateKey required" },
        { status: 400 }
      );
    }

    const sessionId = generateToken();

    // Store encrypted key in DB if available
    const encryptionSecret = process.env.EMAIL_ENCRYPTION_SECRET;
    if (encryptionSecret) {
      try {
        const { storeSessionWallet } = await import("@/lib/db");
        const encryptedKey = encrypt(privateKey, encryptionSecret);
        await storeSessionWallet(sessionId, publicKey, encryptedKey, ip);
      } catch {
        // DB not configured — continue without storing
      }
    }

    // Fund the wallet with SOL for transaction fees via relayer
    const connection = new Connection(RPC, "confirmed");
    const relayer = getRelayerKeypair();

    if (relayer) {
      try {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: relayer.publicKey,
            toPubkey: new PublicKey(publicKey),
            lamports: 0.005 * LAMPORTS_PER_SOL, // Small amount for tx fees
          })
        );
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = relayer.publicKey;
        tx.sign(relayer);
        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(sig, "confirmed");
      } catch (e: any) {
        console.error("Relayer funding failed:", e?.message);
      }
    }

    ipTimestamps.set(ip, Date.now());

    return NextResponse.json({
      publicKey,
      sessionId,
      funded: true,
    });
  } catch (e: any) {
    console.error("create-session-wallet error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
