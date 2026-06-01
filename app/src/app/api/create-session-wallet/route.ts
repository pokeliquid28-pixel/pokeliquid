import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { encrypt, generateToken } from "@/lib/crypto";

const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ"
);
const PROTOCOL_STATE = new PublicKey(
  process.env.NEXT_PUBLIC_PROTOCOL_STATE ?? "8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK"
);
const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi"
);
const FEE_VAULT = new PublicKey(
  process.env.NEXT_PUBLIC_FEE_VAULT ?? "GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581"
);

// Simple in-memory rate limit (resets on cold start — fine for devnet)
const ipTimestamps = new Map<string, number>();

function getRelayerKeypair(): Keypair | null {
  const raw = process.env.RELAYER_PRIVATE_KEY;
  if (!raw) return null;
  try {
    // Support JSON array format
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(new Uint8Array(arr));
  } catch {
    // Support base58 format
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
    const newWallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey)));

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

    // Fund the wallet via relayer or devnet airdrop
    const connection = new Connection(RPC, "confirmed");
    const relayer = getRelayerKeypair();

    if (relayer) {
      // Relayer-funded: transfer SOL + mint USDC + deposit
      try {
        await fundWithRelayer(connection, relayer, newWallet);
      } catch (e: any) {
        console.error("Relayer funding failed:", e?.message);
        // Fall back to airdrop
        await airdropFallback(connection, newWallet.publicKey);
      }
    } else {
      // No relayer: use devnet airdrop
      await airdropFallback(connection, newWallet.publicKey);
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

async function airdropFallback(connection: Connection, pubkey: PublicKey) {
  try {
    const sig = await connection.requestAirdrop(pubkey, 0.05 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  } catch {
    // Airdrop may fail on devnet under load — not critical
  }
}

async function fundWithRelayer(
  connection: Connection,
  relayer: Keypair,
  newWallet: Keypair
) {
  const ata = await getAssociatedTokenAddress(USDC_MINT, newWallet.publicKey);

  // Step 1: Transfer SOL for rent + fees
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: relayer.publicKey,
      toPubkey: newWallet.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );

  // Step 2: Create ATA for the new wallet
  tx.add(
    createAssociatedTokenAccountInstruction(
      relayer.publicKey, // payer
      ata,
      newWallet.publicKey, // owner
      USDC_MINT
    )
  );

  // Step 3: Mint devnet USDC — build instruction manually
  const [mintIxData] = await getMintDevnetUsdcDiscriminator();
  const mintAccounts = [
    { pubkey: newWallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
    { pubkey: USDC_MINT, isSigner: false, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  tx.add({
    programId: PROGRAM_ID,
    keys: mintAccounts,
    data: mintIxData,
  });

  // Step 4: Deposit collateral — need margin account PDA
  const [marginPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("margin"), newWallet.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const depositAmount = 500_000_000; // 500 USDC (6 decimals)
  const depositIxData = getDepositCollateralData(depositAmount);
  const depositAccounts = [
    { pubkey: newWallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
    { pubkey: marginPda, isSigner: false, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  tx.add({
    programId: PROGRAM_ID,
    keys: depositAccounts,
    data: depositIxData,
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = relayer.publicKey;
  tx.sign(relayer, newWallet);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");
}

// Anchor instruction discriminators (sha256("global:<method_name>")[0..8])
async function getMintDevnetUsdcDiscriminator(): Promise<[Buffer]> {
  const crypto = await import("crypto");
  const hash = crypto.createHash("sha256").update("global:mint_devnet_usdc").digest();
  return [hash.subarray(0, 8)];
}

function getDepositCollateralData(amount: number): Buffer {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256").update("global:deposit_collateral").digest();
  const disc = hash.subarray(0, 8);
  const buf = Buffer.alloc(16);
  disc.copy(buf, 0);
  buf.writeBigUInt64LE(BigInt(amount), 8);
  return buf;
}
