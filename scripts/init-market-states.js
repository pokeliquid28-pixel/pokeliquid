"use strict";

/**
 * Initialize MarketState PDAs for all 4 markets.
 * Run: node scripts/init-market-states.js
 */

const fs = require("fs");
const { createHash } = require("crypto");
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} = require("@solana/web3.js");

const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || "/Users/ethangriffin/.config/solana/id.json";
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ");
const PROTOCOL_STATE = new PublicKey("8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK");

const MARKETS = [
  { id: "ETB", oracle: "2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12" },
  { id: "CHARIZARD-X", oracle: "8UWP5YpJh2bZAC24zNaQm9z4p6vLwJJPEGztRY4QHAfg" },
  { id: "CHARMANDER", oracle: "6WQUKKr2uLU4Pv7ZNwUEuLhCrQjEFCvsaZxfCwo2a3XD" },
  { id: "PIKACHU", oracle: "B1BWNQ2YdS7fgage61wFHc1Qs3aFMLtbYw7TPi6bQRYs" },
];

// 100k USDC in 6 decimals
const DEFAULT_MAX_OI = BigInt(100_000_000_000);

function disc(name) {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

function loadKeypair(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf-8"))));
}

function u64Le(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

async function sendTx(connection, payer, ixs) {
  const tx = new Transaction();
  for (const ix of ixs) tx.add(ix);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

async function main() {
  console.log("\n=== Initialize Market States ===\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const admin = loadKeypair(ADMIN_KEYPAIR_PATH);
  console.log(`Admin: ${admin.publicKey.toBase58()}\n`);

  const initDisc = disc("init_market_state");

  for (const market of MARKETS) {
    const marketIdBytes = Buffer.from(market.id);

    // Derive oracle PDA
    const [oraclePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle"), marketIdBytes],
      PROGRAM_ID
    );

    // Derive market state PDA
    const [marketStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketIdBytes],
      PROGRAM_ID
    );

    console.log(`Market: ${market.id}`);
    console.log(`  Oracle PDA:  ${oraclePda.toBase58()}`);
    console.log(`  Market PDA:  ${marketStatePda.toBase58()}`);

    // Verify oracle PDA matches expected
    if (oraclePda.toBase58() !== market.oracle) {
      console.log(`  WARNING: Oracle PDA mismatch! Expected ${market.oracle}, got ${oraclePda.toBase58()}`);
    }

    // Check if already initialized
    const existing = await connection.getAccountInfo(marketStatePda);
    if (existing) {
      console.log(`  Already initialized, skipping.\n`);
      continue;
    }

    // Build instruction data: disc + string_len(u32) + string_bytes + max_long_oi(u64) + max_short_oi(u64)
    const strLenBuf = Buffer.alloc(4);
    strLenBuf.writeUInt32LE(marketIdBytes.length);

    const data = Buffer.concat([
      initDisc,
      strLenBuf,
      marketIdBytes,
      u64Le(DEFAULT_MAX_OI),
      u64Le(DEFAULT_MAX_OI),
    ]);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
        { pubkey: oraclePda, isSigner: false, isWritable: false },
        { pubkey: marketStatePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    try {
      const sig = await sendTx(connection, admin, [ix]);
      console.log(`  Initialized: ${sig}\n`);
    } catch (e) {
      console.error(`  Failed: ${e.message}\n`);
    }
  }

  console.log("Done.\n");
}

main().catch(console.error);
