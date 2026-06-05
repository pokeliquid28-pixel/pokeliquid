/**
 * Initialize Pokeliquid on mainnet with real USDC.
 *
 * Usage:
 *   npx ts-node scripts/init-mainnet.ts
 *
 * Requires:
 *   - ~/.config/solana/id.json (admin keypair with SOL)
 *   - Program already deployed at 5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const REAL_USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const RPC = "https://api.mainnet-beta.solana.com";

// Seeds (must match constants.rs)
const PROTOCOL_SEED = Buffer.from("protocol");
const ORACLE_SEED = Buffer.from("oracle");
const FEE_VAULT_SEED = Buffer.from("fee_vault");
const INSURANCE_FUND_SEED = Buffer.from("insurance_fund");
const LP_POOL_SEED = Buffer.from("liquidity_pool");
const LP_VAULT_SEED = Buffer.from("lp_vault");
const MARKET_SEED = Buffer.from("market");

function getDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function findPDA(seeds: Buffer[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

async function main() {
  const conn = new Connection(RPC, "confirmed");

  // Load admin keypair
  const keyPath = path.join(process.env.HOME!, ".config/solana/id.json");
  const rawKey = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const admin = Keypair.fromSecretKey(new Uint8Array(rawKey));
  console.log("Admin:", admin.publicKey.toBase58());

  const balance = await conn.getBalance(admin.publicKey);
  console.log("Balance:", balance / 1e9, "SOL");

  // Derive PDAs
  const [protocolState] = findPDA([PROTOCOL_SEED]);
  const [oracle] = findPDA([ORACLE_SEED]);
  const [feeVault] = findPDA([FEE_VAULT_SEED]);
  const [insuranceFund] = findPDA([INSURANCE_FUND_SEED]);
  const [lpPool] = findPDA([LP_POOL_SEED]);
  const [lpVault] = findPDA([LP_VAULT_SEED]);

  console.log("\n--- Mainnet PDAs ---");
  console.log("ProtocolState:", protocolState.toBase58());
  console.log("Oracle:", oracle.toBase58());
  console.log("FeeVault:", feeVault.toBase58());
  console.log("InsuranceFund:", insuranceFund.toBase58());
  console.log("LPPool:", lpPool.toBase58());
  console.log("LPVault:", lpVault.toBase58());
  console.log("USDC Mint:", REAL_USDC_MINT.toBase58());

  // Check if already initialized
  const existingState = await conn.getAccountInfo(protocolState);
  if (existingState) {
    console.log("\nProtocol already initialized! Skipping initialize.");
  } else {
    // Step 1: Initialize protocol
    console.log("\n--- Step 1: Initialize protocol ---");
    const initDisc = getDiscriminator("initialize");
    const initIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: protocolState, isSigner: false, isWritable: true },
        { pubkey: oracle, isSigner: false, isWritable: true },
        { pubkey: REAL_USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: feeVault, isSigner: false, isWritable: true },
        { pubkey: insuranceFund, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: initDisc,
    });

    const tx1 = new Transaction().add(initIx);
    const sig1 = await sendAndConfirmTransaction(conn, tx1, [admin]);
    console.log("Initialize tx:", sig1);
  }

  // Step 2: Initialize LP pool
  const existingPool = await conn.getAccountInfo(lpPool);
  if (existingPool) {
    console.log("\nLP pool already initialized! Skipping.");
  } else {
    console.log("\n--- Step 2: Initialize LP pool ---");
    const poolDisc = getDiscriminator("initialize_pool");
    const poolIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: protocolState, isSigner: false, isWritable: false },
        { pubkey: REAL_USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: lpPool, isSigner: false, isWritable: true },
        { pubkey: lpVault, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: poolDisc,
    });

    const tx2 = new Transaction().add(poolIx);
    const sig2 = await sendAndConfirmTransaction(conn, tx2, [admin]);
    console.log("InitializePool tx:", sig2);
  }

  // Step 3: Initialize market oracles
  const markets = [
    { id: "PRISMATIC-ETB", label: "ETB" },
    { id: "CHARIZARD-125/094-PFL", label: "Charizard" },
    { id: "CHARMANDER-038-MEP", label: "Charmander" },
    { id: "PIKACHU-276/217-AH", label: "Pikachu" },
  ];

  for (const market of markets) {
    // Seeds use raw UTF-8 bytes (not zero-padded to 32)
    const marketIdBuf = Buffer.from(market.id, "utf-8");

    const [marketOracle] = findPDA([ORACLE_SEED, marketIdBuf]);
    const [marketState] = findPDA([MARKET_SEED, marketIdBuf]);

    const existingOracle = await conn.getAccountInfo(marketOracle);
    if (existingOracle) {
      console.log(`\n${market.label} oracle already exists: ${marketOracle.toBase58()}`);
    } else {
      console.log(`\n--- Init market oracle: ${market.label} ---`);

      // Encode market_id string: 4 bytes length (LE) + UTF-8 bytes
      const marketIdBytes = Buffer.from(market.id, "utf-8");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(marketIdBytes.length);
      const oracleData = Buffer.concat([getDiscriminator("init_market_oracle"), lenBuf, marketIdBytes]);

      const oracleIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: admin.publicKey, isSigner: true, isWritable: true },
          { pubkey: protocolState, isSigner: false, isWritable: false },
          { pubkey: marketOracle, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: oracleData,
      });

      const txO = new Transaction().add(oracleIx);
      const sigO = await sendAndConfirmTransaction(conn, txO, [admin]);
      console.log(`  Oracle tx: ${sigO}`);
      console.log(`  Oracle PDA: ${marketOracle.toBase58()}`);
    }

    const existingMarketState = await conn.getAccountInfo(marketState);
    if (existingMarketState) {
      console.log(`  ${market.label} market state already exists: ${marketState.toBase58()}`);
    } else {
      console.log(`  Init market state: ${market.label}`);

      const marketIdBytes = Buffer.from(market.id, "utf-8");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(marketIdBytes.length);

      // max_long_oi and max_short_oi: 100k USDC = 100_000_000_000 (u64 LE)
      const maxOI = Buffer.alloc(8);
      maxOI.writeBigUInt64LE(BigInt("100000000000"));

      const stateData = Buffer.concat([
        getDiscriminator("init_market_state"),
        lenBuf,
        marketIdBytes,
        maxOI, // max_long_oi
        maxOI, // max_short_oi
      ]);

      const stateIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: admin.publicKey, isSigner: true, isWritable: true },
          { pubkey: protocolState, isSigner: false, isWritable: false },
          { pubkey: marketOracle, isSigner: false, isWritable: false },
          { pubkey: marketState, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: stateData,
      });

      const txS = new Transaction().add(stateIx);
      const sigS = await sendAndConfirmTransaction(conn, txS, [admin]);
      console.log(`  MarketState tx: ${sigS}`);
      console.log(`  MarketState PDA: ${marketState.toBase58()}`);
    }
  }

  // Step 4: Set secondary authority
  console.log("\n--- Step 4: Set secondary authority ---");
  const secondaryAuth = new PublicKey("2XsE4rWJa7LRjFWfMFUmWFxBeqNaKmuXdfJk5iWy1ssH");

  const paramsDisc = getDiscriminator("update_params");
  // Encode ProtocolParams — all Option fields. We only set secondary_authority.
  // Option<u64> = 0 (None) for first 7 fields
  // Option<bool> = 0 (None)
  // Option<i64> = 0 (None) for 2 fields
  // Option<Pubkey> = 1 + 32 bytes
  const paramsBuf = Buffer.alloc(1 * 10 + 1 + 32); // 10 None options + 1 Some + 32 bytes pubkey
  let offset = 0;
  for (let i = 0; i < 10; i++) {
    paramsBuf[offset++] = 0; // None
  }
  paramsBuf[offset++] = 1; // Some(secondary_authority)
  secondaryAuth.toBuffer().copy(paramsBuf, offset);

  const paramsData = Buffer.concat([paramsDisc, paramsBuf]);
  const paramsIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      { pubkey: protocolState, isSigner: false, isWritable: true },
      { pubkey: oracle, isSigner: false, isWritable: true },
    ],
    data: paramsData,
  });

  const tx4 = new Transaction().add(paramsIx);
  const sig4 = await sendAndConfirmTransaction(conn, tx4, [admin]);
  console.log("UpdateParams tx:", sig4);

  // Print summary
  console.log("\n========================================");
  console.log("MAINNET INITIALIZATION COMPLETE");
  console.log("========================================");
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("ProtocolState:", protocolState.toBase58());
  console.log("Oracle:", oracle.toBase58());
  console.log("FeeVault:", feeVault.toBase58());
  console.log("InsuranceFund:", insuranceFund.toBase58());
  console.log("LPPool:", lpPool.toBase58());
  console.log("LPVault:", lpVault.toBase58());
  console.log("USDC Mint:", REAL_USDC_MINT.toBase58());

  for (const market of markets) {
    const idBuf = Buffer.from(market.id, "utf-8");
    const [mktOracle] = findPDA([ORACLE_SEED, idBuf]);
    const [mktState] = findPDA([MARKET_SEED, idBuf]);
    console.log(`\n${market.label}:`);
    console.log(`  Oracle: ${mktOracle.toBase58()}`);
    console.log(`  State:  ${mktState.toBase58()}`);
  }

  const finalBalance = await conn.getBalance(admin.publicKey);
  console.log("\nRemaining balance:", finalBalance / 1e9, "SOL");
}

main().catch((err) => {
  console.error("Init failed:", err);
  process.exit(1);
});
