"use strict";

/**
 * End-to-end devnet test for Pokeliquid (post per-market OI redesign).
 * Run: node scripts/e2e-test.js
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
const {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
} = require("@solana/spl-token");

// ── Config ──────────────────────────────────────────────────────────────────

const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || "/Users/ethangriffin/.config/solana/id.json";
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const KEEPER_API = process.env.KEEPER_API || "http://157.180.67.25:3001";
const PROGRAM_ID = new PublicKey("7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ");

const PROTOCOL_STATE = new PublicKey("8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK");
const ETB_ORACLE = new PublicKey("4v5ogQV1i2yQhdsc4YuG78AG5NvtDaE9kfCSCQwL3bZH");
const FEE_VAULT = new PublicKey("GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581");
const INS_FUND = new PublicKey("9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F");
const USDC_MINT = new PublicKey("Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi");
const LP_POOL = PublicKey.findProgramAddressSync([Buffer.from("liquidity_pool")], PROGRAM_ID)[0];
const LP_VAULT = PublicKey.findProgramAddressSync([Buffer.from("lp_vault")], PROGRAM_ID)[0];
const ETB_MARKET_STATE = PublicKey.findProgramAddressSync([Buffer.from("market"), Buffer.from("ETB")], PROGRAM_ID)[0];

const ORACLE_ADDRS = {
  ETB: "4v5ogQV1i2yQhdsc4YuG78AG5NvtDaE9kfCSCQwL3bZH",
  "CHARIZARD-X": "8UWP5YpJh2bZAC24zNaQm9z4p6vLwJJPEGztRY4QHAfg",
  CHARMANDER: "6WQUKKr2uLU4Pv7ZNwUEuLhCrQjEFCvsaZxfCwo2a3XD",
  PIKACHU: "B1BWNQ2YdS7fgage61wFHc1Qs3aFMLtbYw7TPi6bQRYs",
};

// Position layout: oracle(32) + direction(1) + entry_price(8) + notional(8) + collateral(8) +
//                  leverage(1) + open_timestamp(8) + sl_price(8) + tp_price(8) + is_open(1) + padding(9) = 92 bytes
const POSITION_BYTES = 92;
// MarginAccount: disc(8) + owner(32) + collateral(8) + 5 positions * 92 = 508, but SPACE=546 on-chain
const MARGIN_ACCOUNT_SIZE = 546;
const POS_START = 48; // 8 (disc) + 32 (owner) + 8 (collateral)

// ── Discriminators ──────────────────────────────────────────────────────────

function disc(name) {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

const DISC = {
  mint_devnet_usdc: disc("mint_devnet_usdc"),
  deposit_collateral: disc("deposit_collateral"),
  withdraw_collateral: disc("withdraw_collateral"),
  open_position: disc("open_position"),
  close_position: disc("close_position"),
  close_margin_account: disc("close_margin_account"),
  set_sl_tp: disc("set_sl_tp"),
  lp_deposit: disc("lp_deposit"),
  lp_withdraw: disc("lp_withdraw"),
  settle_funding: disc("settle_funding"),
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadKeypair(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf-8"))));
}

function u64Le(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function marginPda(user) {
  return PublicKey.findProgramAddressSync([Buffer.from("margin"), user.toBuffer()], PROGRAM_ID)[0];
}

function lpPositionPda(user) {
  return PublicKey.findProgramAddressSync([Buffer.from("lp"), user.toBuffer()], PROGRAM_ID)[0];
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

function countOpenPositions(data) {
  let count = 0;
  for (let i = 0; i < 5; i++) {
    // is_open byte is at the end of each position slot
    // Position layout in MarginAccount: each POSITION_BYTES block
    // The is_open flag: oracle(32)+dir(1)+entry(8)+notional(8)+coll(8)+lev(1)+ts(8)+sl(8)+tp(8) = offset 82 within position
    // Actually let's check the direction byte — if it's 0 or 1, and notional > 0, it's open
    // Simpler: read notional (offset 41 within position = POS_START + i*92 + 32 + 1 + 8 = +41)
    const notionalOffset = POS_START + i * POSITION_BYTES + 32 + 1 + 8;
    if (notionalOffset + 8 <= data.length) {
      const notional = data.readBigUInt64LE(notionalOffset);
      if (notional > 0n) count++;
    }
  }
  return count;
}

// ── Test harness ────────────────────────────────────────────────────────────

const results = [];
function step(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓ PASS" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   POKELIQUID E2E DEVNET TEST SUITE   ║");
  console.log("╚══════════════════════════════════════╝\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(ADMIN_KEYPAIR_PATH);
  const userPubkey = payer.publicKey;
  const marginAccount = marginPda(userPubkey);
  const ata = getAssociatedTokenAddressSync(USDC_MINT, userPubkey, false);

  console.log(`  User:    ${userPubkey.toBase58()}`);
  console.log(`  Margin:  ${marginAccount.toBase58()}`);
  console.log(`  ATA:     ${ata.toBase58()}\n`);

  // ═══════════════════════════════════════
  // 1. Oracle freshness (all 4 markets)
  // ═══════════════════════════════════════
  console.log("── Oracle Freshness ──");
  for (const [market, addr] of Object.entries(ORACLE_ADDRS)) {
    try {
      const info = await connection.getAccountInfo(new PublicKey(addr));
      const price = Number(info.data.readBigUInt64LE(8)) / 1e6;
      const lastUpdated = Number(info.data.readBigUInt64LE(16));
      const nowSec = Math.floor(Date.now() / 1000);
      const age = nowSec - lastUpdated;
      step(`Oracle ${market}`, age < 600, `$${price.toFixed(2)} age=${age}s`);
    } catch (e) {
      step(`Oracle ${market}`, false, e.message);
    }
  }

  // ═══════════════════════════════════════
  // 2. Close old margin account if exists (migration)
  // ═══════════════════════════════════════
  console.log("\n── Account Migration ──");
  try {
    const existing = await connection.getAccountInfo(marginAccount);
    if (existing && existing.data.length < MARGIN_ACCOUNT_SIZE) {
      console.log(`  Old margin account found (${existing.data.length} bytes), closing...`);
      const sig = await sendTx(connection, payer, [
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: userPubkey, isSigner: true, isWritable: true },
            { pubkey: marginAccount, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(DISC.close_margin_account),
        }),
      ]);
      step("Close old margin account", true, `${existing.data.length}→${MARGIN_ACCOUNT_SIZE} tx=${sig.slice(0,16)}…`);
      await sleep(2000);
    } else if (existing) {
      step("Margin account size OK", true, `${existing.data.length} bytes`);
    } else {
      step("No margin account (will be created)", true, "init_if_needed on deposit");
    }
  } catch (e) {
    step("Account migration", false, e.message);
  }

  // ═══════════════════════════════════════
  // 3. Mint test USDC
  // ═══════════════════════════════════════
  console.log("\n── Mint & Deposit ──");
  try {
    let needsCreate = false;
    try { await getAccount(connection, ata); } catch { needsCreate = true; }
    const ixs = [];
    if (needsCreate) {
      ixs.push(createAssociatedTokenAccountInstruction(userPubkey, ata, userPubkey, USDC_MINT));
    }
    ixs.push(new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: true },
        { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
        { pubkey: USDC_MINT, isSigner: false, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(DISC.mint_devnet_usdc),
    }));
    const sig = await sendTx(connection, payer, ixs);
    step("Mint test USDC", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("Mint test USDC", false, e.message);
  }

  // ═══════════════════════════════════════
  // 4. Deposit 100 USDC
  // ═══════════════════════════════════════
  try {
    const amount = 100_000_000n;
    const data = Buffer.concat([DISC.deposit_collateral, u64Le(amount)]);
    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    const accInfo = await connection.getAccountInfo(marginAccount);
    const collateral = Number(accInfo.data.readBigUInt64LE(40)) / 1e6;
    step("Deposit 100 USDC", true, `collateral=$${collateral.toFixed(2)} tx=${sig.slice(0,16)}…`);
  } catch (e) {
    step("Deposit 100 USDC", false, e.message);
  }

  // ═══════════════════════════════════════
  // 5. Open LONG $10 2x on ETB
  // ═══════════════════════════════════════
  console.log("\n── Open Positions ──");
  try {
    const dirBuf = Buffer.from([0]); // Long
    const collateral = u64Le(10_000_000n);
    const leverageBuf = Buffer.from([2]);
    const slNone = Buffer.from([0]);
    const tpNone = Buffer.from([0]);
    const data = Buffer.concat([DISC.open_position, dirBuf, collateral, leverageBuf, slNone, tpNone]);

    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ETB_ORACLE, isSigner: false, isWritable: false },
          { pubkey: ETB_MARKET_STATE, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
          { pubkey: INS_FUND, isSigner: false, isWritable: true },
          { pubkey: LP_POOL, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("Open LONG $10 2x ETB", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("Open LONG $10 2x ETB", false, e.message);
  }

  // ═══════════════════════════════════════
  // 6. Open SHORT $10 2x on ETB
  // ═══════════════════════════════════════
  try {
    const dirBuf = Buffer.from([1]); // Short
    const collateral = u64Le(10_000_000n);
    const leverageBuf = Buffer.from([2]);
    const slNone = Buffer.from([0]);
    const tpNone = Buffer.from([0]);
    const data = Buffer.concat([DISC.open_position, dirBuf, collateral, leverageBuf, slNone, tpNone]);

    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ETB_ORACLE, isSigner: false, isWritable: false },
          { pubkey: ETB_MARKET_STATE, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
          { pubkey: INS_FUND, isSigner: false, isWritable: true },
          { pubkey: LP_POOL, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("Open SHORT $10 2x ETB", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("Open SHORT $10 2x ETB", false, e.message);
  }

  // ═══════════════════════════════════════
  // 7. Set SL/TP
  // ═══════════════════════════════════════
  console.log("\n── SL/TP ──");
  let currentPrice = 0n;
  try {
    const oracleInfo = await connection.getAccountInfo(ETB_ORACLE);
    currentPrice = oracleInfo.data.readBigUInt64LE(8);
  } catch {}

  // Set SL on long (position 0)
  try {
    const slPrice = currentPrice * 95n / 100n;
    const data = Buffer.concat([DISC.set_sl_tp, Buffer.from([0]), Buffer.from([1]), u64Le(slPrice), Buffer.from([0])]);
    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: false },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ETB_ORACLE, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("Set SL on long (-5%)", true, `sl=$${(Number(slPrice)/1e6).toFixed(2)} tx=${sig.slice(0,16)}…`);
  } catch (e) {
    step("Set SL on long (-5%)", false, e.message);
  }

  // Set TP on short (position 1) — for short, TP must be below entry
  try {
    const tpPrice = currentPrice * 95n / 100n;
    const data = Buffer.concat([DISC.set_sl_tp, Buffer.from([1]), Buffer.from([0]), Buffer.from([1]), u64Le(tpPrice)]);
    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: false },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ETB_ORACLE, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("Set TP on short (-5%)", true, `tp=$${(Number(tpPrice)/1e6).toFixed(2)} tx=${sig.slice(0,16)}…`);
  } catch (e) {
    step("Set TP on short (-5%)", false, e.message);
  }

  // ═══════════════════════════════════════
  // 8. Verify positions open
  // ═══════════════════════════════════════
  console.log("\n── Position Verification ──");
  try {
    await sleep(2000);
    const accInfo = await connection.getAccountInfo(marginAccount);
    const openCount = countOpenPositions(accInfo.data);
    step("Positions open & healthy", openCount >= 2, `${openCount} open`);
  } catch (e) {
    step("Positions open & healthy", false, e.message);
  }

  // ═══════════════════════════════════════
  // 9. Wait 30s — keeper shouldn't liquidate healthy positions
  // ═══════════════════════════════════════
  console.log("  ... waiting 30 seconds (keeper liq check) ...");
  await sleep(30_000);
  try {
    const accInfo = await connection.getAccountInfo(marginAccount);
    const openCount = countOpenPositions(accInfo.data);
    step("Positions survive keeper (30s)", openCount >= 2, `${openCount} still open`);
  } catch (e) {
    step("Positions survive keeper", false, e.message);
  }

  // ═══════════════════════════════════════
  // 10. Close long position
  // ═══════════════════════════════════════
  console.log("\n── Close Positions ──");
  try {
    const data = Buffer.concat([DISC.close_position, Buffer.from([0])]);
    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ETB_ORACLE, isSigner: false, isWritable: false },
          { pubkey: ETB_MARKET_STATE, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
          { pubkey: INS_FUND, isSigner: false, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: LP_POOL, isSigner: false, isWritable: true },
          { pubkey: LP_VAULT, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("Close long position", true, `tx=${sig.slice(0,16)}…`);
  } catch (e) {
    step("Close long position", false, e.message);
  }

  // ═══════════════════════════════════════
  // 11. Verify PnL settlement
  // ═══════════════════════════════════════
  try {
    await sleep(2000);
    const accInfo = await connection.getAccountInfo(marginAccount);
    const collateral = Number(accInfo.data.readBigUInt64LE(40)) / 1e6;
    step("PnL settled (long closed)", collateral > 0, `free_collateral=$${collateral.toFixed(2)}`);
  } catch (e) {
    step("PnL settlement", false, e.message);
  }

  // ═══════════════════════════════════════
  // 12. Close short position
  // ═══════════════════════════════════════
  try {
    const data = Buffer.concat([DISC.close_position, Buffer.from([1])]);
    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ETB_ORACLE, isSigner: false, isWritable: false },
          { pubkey: ETB_MARKET_STATE, isSigner: false, isWritable: true },
          { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
          { pubkey: INS_FUND, isSigner: false, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: LP_POOL, isSigner: false, isWritable: true },
          { pubkey: LP_VAULT, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("Close short position", true, `tx=${sig.slice(0,16)}…`);
  } catch (e) {
    step("Close short position", false, e.message);
  }

  // ═══════════════════════════════════════
  // 13. Withdraw collateral
  // ═══════════════════════════════════════
  console.log("\n── Withdraw ──");
  try {
    const accInfo = await connection.getAccountInfo(marginAccount);
    const freeCollateral = accInfo.data.readBigUInt64LE(40);
    if (freeCollateral > 0n) {
      const data = Buffer.concat([DISC.withdraw_collateral, u64Le(freeCollateral)]);
      const sig = await sendTx(connection, payer, [
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: userPubkey, isSigner: true, isWritable: true },
            { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
            { pubkey: marginAccount, isSigner: false, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          data,
        }),
      ]);
      step("Withdraw collateral", true, `$${(Number(freeCollateral)/1e6).toFixed(2)} tx=${sig.slice(0,16)}…`);
    } else {
      step("Withdraw collateral", true, "no free collateral (fees consumed all)");
    }
  } catch (e) {
    step("Withdraw collateral", false, e.message);
  }

  // ═══════════════════════════════════════
  // 14. LP Deposit
  // ═══════════════════════════════════════
  console.log("\n── LP Operations ──");
  try {
    // Mint USDC first for LP deposit
    await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
          { pubkey: USDC_MINT, isSigner: false, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(DISC.mint_devnet_usdc),
      }),
    ]);

    const lpPda = lpPositionPda(userPubkey);
    const data = Buffer.concat([DISC.lp_deposit, u64Le(10_000_000n)]); // 10 USDC
    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
          { pubkey: LP_POOL, isSigner: false, isWritable: true },
          { pubkey: lpPda, isSigner: false, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: LP_VAULT, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("LP deposit 10 USDC", true, `tx=${sig.slice(0,16)}…`);
  } catch (e) {
    step("LP deposit", false, e.message);
  }

  // ═══════════════════════════════════════
  // 15. LP Withdraw
  // ═══════════════════════════════════════
  try {
    await sleep(2000);
    const lpPda = lpPositionPda(userPubkey);
    const lpInfo = await connection.getAccountInfo(lpPda);
    // LpPosition: disc(8) + owner(32) + shares(8) + ...
    const shares = lpInfo.data.readBigUInt64LE(40);

    const data = Buffer.concat([DISC.lp_withdraw, u64Le(shares)]);
    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
          { pubkey: LP_POOL, isSigner: false, isWritable: true },
          { pubkey: lpPda, isSigner: false, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: LP_VAULT, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("LP withdraw (all shares)", true, `shares=${shares} tx=${sig.slice(0,16)}…`);
  } catch (e) {
    step("LP withdraw", false, e.message);
  }

  // ═══════════════════════════════════════
  // 16. Keeper bot checks
  // ═══════════════════════════════════════
  console.log("\n── Keeper Bot Checks ──");
  try {
    const resp = await fetch(`${KEEPER_API}/health`);
    const health = await resp.json();
    step("Liquidation loop running", health.liquidation.checks_1h > 0, `${health.liquidation.checks_1h} checks/hr`);
  } catch (e) {
    step("Liquidation loop", false, e.message);
  }

  // SL/TP checks are part of the same liquidation loop
  try {
    const resp = await fetch(`${KEEPER_API}/health`);
    const health = await resp.json();
    step("SL/TP loop running", health.liquidation.checks_1h > 0, "integrated with liq loop");
  } catch (e) {
    step("SL/TP loop", false, e.message);
  }

  // ═══════════════════════════════════════
  // 17. Trade history
  // ═══════════════════════════════════════
  console.log("\n── Trade History & Leaderboard ──");
  try {
    const resp = await fetch(`${KEEPER_API}/trades?user=${userPubkey.toBase58()}&limit=5`);
    const data = await resp.json();
    step("Trade history API", data.trades && data.trades.length > 0, `${data.trades?.length || 0} trades, total=${data.total || 0}`);
  } catch (e) {
    step("Trade history API", false, e.message);
  }

  // Stats endpoint
  try {
    const resp = await fetch(`${KEEPER_API}/stats`);
    const data = await resp.json();
    step("Stats API", data.total_trades_24h !== undefined, `vol_24h=$${data.total_volume_24h} trades_24h=${data.total_trades_24h}`);
  } catch (e) {
    step("Stats API", false, e.message);
  }

  // ═══════════════════════════════════════
  // 18. Frontend connectivity
  // ═══════════════════════════════════════
  console.log("\n── Frontend Checks ──");
  try {
    const resp = await fetch("https://app-two-green-66.vercel.app", { redirect: "follow" });
    const html = await resp.text();
    step("Frontend loads", resp.ok && html.length > 1000, `${resp.status} ${html.length} bytes`);
  } catch (e) {
    step("Frontend loads", false, e.message);
  }

  try {
    const resp = await fetch("https://app-two-green-66.vercel.app/api/keeper/health");
    const data = await resp.json();
    step("API proxy (Vercel→Hetzner)", data.status === "healthy", `status=${data.status}`);
  } catch (e) {
    step("API proxy", false, e.message);
  }

  try {
    const resp = await fetch("https://app-two-green-66.vercel.app/api/me");
    step("Auth endpoint", resp.status === 401 || resp.status === 200, `status=${resp.status}`);
  } catch (e) {
    step("Auth endpoint", false, e.message);
  }

  try {
    const r1 = await fetch(`${KEEPER_API}/prices?market=ETB&limit=3`);
    const d1 = await r1.json();
    const r2 = await fetch(`${KEEPER_API}/prices?market=CHARIZARD-X&limit=3`);
    const d2 = await r2.json();
    step("Chart data per market", d1.length > 0 && d2.length > 0, `ETB=${d1.length} CHARIZARD-X=${d2.length} entries`);
  } catch (e) {
    step("Chart data", false, e.message);
  }

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║     POKELIQUID E2E TEST RESULTS      ║");
  console.log("╠══════════════════════════════════════╣");

  const categories = {
    "KEEPER": ["Oracle ETB", "Oracle CHARIZARD", "Oracle CHARMANDER", "Oracle PIKACHU", "Liquidation", "SL/TP"],
    "TRADING": ["Mint", "Deposit", "Open LONG", "Open SHORT", "Set SL", "Set TP", "Close long", "Close short", "PnL", "Withdraw"],
    "LP": ["LP deposit", "LP withdraw"],
    "FRONTEND": ["Frontend", "API proxy", "Auth", "Chart"],
  };

  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`║  ${status}  ${r.name.padEnd(30)}║`);
  }

  console.log("╠══════════════════════════════════════╣");
  console.log(`║  TOTAL: ${passed}/${total} passed${" ".repeat(20 - `${passed}/${total}`.length)}║`);
  if (failed > 0) {
    console.log("╠══════════════════════════════════════╣");
    console.log("║  FAILURES:                           ║");
    for (const r of results.filter(r => !r.pass)) {
      console.log(`║  - ${r.name}: ${(r.detail || "").slice(0, 28)}║`);
    }
  }
  console.log("╚══════════════════════════════════════╝\n");

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputFile = `scripts/e2e-results-${timestamp}.txt`;
  const output = results.map(r => `${r.pass ? "PASS" : "FAIL"} ${r.name} — ${r.detail || ""}`).join("\n");
  fs.writeFileSync(outputFile, `Pokeliquid E2E Test — ${new Date().toISOString()}\n${passed}/${total} passed\n\n${output}\n`);
  console.log(`Results saved to ${outputFile}\n`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
