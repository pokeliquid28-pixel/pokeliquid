"use strict";

/**
 * Initialize ETB market oracle + market state.
 * ETB was using the default oracle (seeded [b"oracle"]), but now needs
 * a market-specific oracle (seeded [b"oracle", b"ETB"]) for MarketState.
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
  console.log("\n=== Initialize ETB Market Oracle + State ===\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const admin = loadKeypair(ADMIN_KEYPAIR_PATH);
  const marketId = "ETB";
  const marketIdBytes = Buffer.from(marketId);

  const [oraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle"), marketIdBytes],
    PROGRAM_ID
  );
  const [marketStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketIdBytes],
    PROGRAM_ID
  );

  console.log(`ETB Oracle PDA:  ${oraclePda.toBase58()}`);
  console.log(`ETB Market PDA:  ${marketStatePda.toBase58()}`);

  // Step 1: Init market oracle for ETB
  const oracleExists = await connection.getAccountInfo(oraclePda);
  if (oracleExists) {
    console.log("\nETB oracle already exists.");
  } else {
    console.log("\nInitializing ETB market oracle...");
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

  // Step 2: Init market state for ETB
  const stateExists = await connection.getAccountInfo(marketStatePda);
  if (stateExists) {
    console.log("ETB market state already exists.");
  } else {
    console.log("Initializing ETB market state...");
    const initStateDisc = disc("init_market_state");
    const strLenBuf = Buffer.alloc(4);
    strLenBuf.writeUInt32LE(marketIdBytes.length);

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
        strLenBuf,
        marketIdBytes,
        u64Le(DEFAULT_MAX_OI),
        u64Le(DEFAULT_MAX_OI),
      ]),
    });

    const sig = await sendTx(connection, admin, [ix]);
    console.log(`  Market state initialized: ${sig}`);
  }

  // Step 3: Push initial price to the new ETB oracle
  console.log("\nUpdating ETB oracle price...");
  const updateDisc = disc("update_market_oracle");
  const strLenBuf = Buffer.alloc(4);
  strLenBuf.writeUInt32LE(marketIdBytes.length);
  const price = 158_000_000; // $158

  const updateIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
      { pubkey: oraclePda, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([updateDisc, strLenBuf, marketIdBytes, u64Le(price)]),
  });

  const sig = await sendTx(connection, admin, [updateIx]);
  console.log(`  Price updated: ${sig}`);

  console.log(`\nETB now uses oracle: ${oraclePda.toBase58()}`);
  console.log("Update markets.ts and keeper to use this oracle address.\n");
}

main().catch(console.error);
