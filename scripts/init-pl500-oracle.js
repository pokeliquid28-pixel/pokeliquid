"use strict";

/**
 * Initialize PL500 market oracle + market state on mainnet.
 * Market ID: "PL500"
 * Seed price: $103,632
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
const RPC_URL = process.env.RPC_URL || "https://mainnet.helius-rpc.com/?api-key=358c9ec3-db8b-46a1-ac6c-d702d3a19340";
const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const PROTOCOL_STATE = new PublicKey("6yAYSsp863889v7bhMEwj6tVq5DvFTi1gwzwHFrqwLFL");

const DEFAULT_MAX_OI = BigInt(100_000_000_000); // 100k USDC in 6 decimals

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
  console.log("\n=== Initialize PL500 Market Oracle + State (Mainnet) ===\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const admin = loadKeypair(ADMIN_KEYPAIR_PATH);
  const marketId = "PL500";
  const marketIdBytes = Buffer.from(marketId);

  const [oraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle"), marketIdBytes],
    PROGRAM_ID
  );
  const [marketStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketIdBytes],
    PROGRAM_ID
  );

  console.log(`Admin:           ${admin.publicKey.toBase58()}`);
  console.log(`PL500 Oracle PDA:  ${oraclePda.toBase58()}`);
  console.log(`PL500 Market PDA:  ${marketStatePda.toBase58()}`);

  // Step 1: Init market oracle for PL500
  const oracleExists = await connection.getAccountInfo(oraclePda);
  if (oracleExists) {
    console.log("\nPL500 oracle already exists.");
  } else {
    console.log("\nInitializing PL500 market oracle...");
    const initOracleDisc = disc("init_market_oracle");
    const strLenBuf = Buffer.alloc(4);
    strLenBuf.writeUInt32LE(marketIdBytes.length);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
        { pubkey: oraclePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([initOracleDisc, strLenBuf, marketIdBytes]),
    });

    const sig = await sendTx(connection, admin, [ix]);
    console.log(`  Oracle initialized: ${sig}`);
  }

  // Step 2: Set seed price on PL500 oracle ($103,632 = 103_632_000_000 in price scale 1e6)
  console.log("\nUpdating PL500 oracle with seed price ($103,632)...");
  const updateDisc = disc("update_market_oracle");
  const strLenBuf2 = Buffer.alloc(4);
  strLenBuf2.writeUInt32LE(marketIdBytes.length);
  const price = 103_632_000_000; // $103,632 * 1e6

  const updateIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
      { pubkey: oraclePda, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([updateDisc, strLenBuf2, marketIdBytes, u64Le(price)]),
  });

  const sig2 = await sendTx(connection, admin, [updateIx]);
  console.log(`  Price updated: ${sig2}`);

  // Step 3: Init market state for PL500
  const stateExists = await connection.getAccountInfo(marketStatePda);
  if (stateExists) {
    console.log("PL500 market state already exists.");
  } else {
    console.log("Initializing PL500 market state...");
    const initStateDisc = disc("init_market_state");
    const strLenBuf3 = Buffer.alloc(4);
    strLenBuf3.writeUInt32LE(marketIdBytes.length);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
        { pubkey: oraclePda, isSigner: false, isWritable: false },
        { pubkey: marketStatePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        initStateDisc,
        strLenBuf3,
        marketIdBytes,
        u64Le(DEFAULT_MAX_OI),
        u64Le(DEFAULT_MAX_OI),
      ]),
    });

    const sig = await sendTx(connection, admin, [ix]);
    console.log(`  Market state initialized: ${sig}`);
  }

  console.log(`\nPL500 oracle:       ${oraclePda.toBase58()}`);
  console.log(`PL500 market state: ${marketStatePda.toBase58()}`);
  console.log("Update markets.ts and keeper to use these addresses.\n");
}

main().catch(console.error);
