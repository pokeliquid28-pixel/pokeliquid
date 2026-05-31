"use strict";

/**
 * End-to-end devnet test for Pokeliquid.
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
const PROGRAM_ID = new PublicKey("7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ");

const PROTOCOL_STATE = new PublicKey("8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK");
const ORACLE_PUBKEY = new PublicKey("2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12");
const FEE_VAULT = new PublicKey("GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581");
const INS_FUND = new PublicKey("9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F");
const USDC_MINT = new PublicKey("Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi");
const LP_POOL = PublicKey.findProgramAddressSync([Buffer.from("liquidity_pool")], PROGRAM_ID)[0];
const LP_VAULT = PublicKey.findProgramAddressSync([Buffer.from("lp_vault")], PROGRAM_ID)[0];

// ── Discriminators ──────────────────────────────────────────────────────────

function disc(name) {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

const DISC = {
  mint_devnet_usdc: disc("mint_devnet_usdc"),
  deposit_collateral: disc("deposit_collateral"),
  open_position: disc("open_position"),
  close_position: disc("close_position"),
  set_sl_tp: disc("set_sl_tp"),
  withdraw_collateral: disc("withdraw_collateral"),
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

// ── Test harness ────────────────────────────────────────────────────────────

const results = [];
function step(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Pokeliquid E2E Devnet Test ===\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(ADMIN_KEYPAIR_PATH);
  const userPubkey = payer.publicKey;
  const marginAccount = marginPda(userPubkey);
  const ata = getAssociatedTokenAddressSync(USDC_MINT, userPubkey, false);

  console.log(`  User:    ${userPubkey.toBase58()}`);
  console.log(`  Margin:  ${marginAccount.toBase58()}`);
  console.log(`  ATA:     ${ata.toBase58()}\n`);

  // 1. Check oracle freshness
  try {
    const oracleInfo = await connection.getAccountInfo(ORACLE_PUBKEY);
    const price = oracleInfo.data.readBigUInt64LE(8);
    const lastUpdated = Number(oracleInfo.data.readBigInt64LE(16));
    const nowSec = Math.floor(Date.now() / 1000);
    const age = nowSec - lastUpdated;
    const fresh = age < 300;
    step("1. Oracle freshness", fresh, `price=${Number(price)/1e6} age=${age}s`);
    if (!fresh) {
      console.log("  Oracle is stale — tests may fail. Consider running the keeper first.\n");
    }
  } catch (e) {
    step("1. Oracle freshness", false, e.message);
  }

  // 2. Mint 100 test USDC
  try {
    // Ensure ATA exists
    let needsCreate = false;
    try { await getAccount(connection, ata); } catch { needsCreate = true; }

    const ixs = [];
    if (needsCreate) {
      ixs.push(createAssociatedTokenAccountInstruction(userPubkey, ata, userPubkey, USDC_MINT));
    }

    const mintData = Buffer.from(DISC.mint_devnet_usdc);
    ixs.push(new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: true },
        { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
        { pubkey: USDC_MINT, isSigner: false, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: mintData,
    }));

    const sig = await sendTx(connection, payer, ixs);
    step("2. Mint test USDC", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("2. Mint test USDC", false, e.message);
  }

  // 3. Deposit 50 USDC
  try {
    const amount = 50_000_000n; // 50 USDC
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
    step("3. Deposit 50 USDC", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("3. Deposit 50 USDC", false, e.message);
  }

  // 4. Open long position: $10, 2x
  try {
    // direction: Long = {0}, collateral: 10 USDC, leverage: 2, sl: None, tp: None
    const dirBuf = Buffer.from([0]); // Long
    const collateral = u64Le(10_000_000n);
    const leverageBuf = Buffer.from([2]);
    const slNone = Buffer.from([0]); // Option::None
    const tpNone = Buffer.from([0]); // Option::None
    const data = Buffer.concat([DISC.open_position, dirBuf, collateral, leverageBuf, slNone, tpNone]);

    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
          { pubkey: INS_FUND, isSigner: false, isWritable: true },
          { pubkey: LP_POOL, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("4. Open long $10 2x", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("4. Open long $10 2x", false, e.message);
  }

  // 5. Open short position: $10, 2x
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
          { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: FEE_VAULT, isSigner: false, isWritable: true },
          { pubkey: INS_FUND, isSigner: false, isWritable: true },
          { pubkey: LP_POOL, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("5. Open short $10 2x", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("5. Open short $10 2x", false, e.message);
  }

  // Quick position check right after opens
  {
    await sleep(2_000);
    const accInfo = await connection.getAccountInfo(marginAccount, "confirmed");
    const posStart = 48;
    // Print hex dump of first 130 bytes of position data (covers 2 slots)
    const posData = accInfo.data.slice(posStart, posStart + 130);
    console.log(`  [debug] account length: ${accInfo.data.length}`);
    console.log(`  [debug] pos data hex (offset 48, 130 bytes):`);
    for (let i = 0; i < 130; i += 61) {
      const chunk = posData.slice(i, Math.min(i+61, 130));
      console.log(`    slot ${i/61}: tag=${chunk[0]} data=${chunk.toString("hex")}`);
    }
  }

  // 6. Wait 25 seconds (already waited 2 above)
  console.log("  ... waiting 25 seconds ...");
  await sleep(25_000);
  step("6. Wait 25s", true);

  // Read current oracle price for SL/TP calculation
  let currentPrice = 0n;
  try {
    const oracleInfo = await connection.getAccountInfo(ORACLE_PUBKEY);
    currentPrice = oracleInfo.data.readBigUInt64LE(8);
  } catch {}

  // 7. Set SL on long (position 0) at current_price - 5%
  try {
    const slPrice = currentPrice * 95n / 100n;
    const posIdx = Buffer.from([0]);
    const slSome = Buffer.concat([Buffer.from([1]), u64Le(slPrice)]); // Option::Some
    const tpNone = Buffer.from([0]);
    const data = Buffer.concat([DISC.set_sl_tp, posIdx, slSome, tpNone]);

    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: false },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("7. Set SL on long (-5%)", true, `sl=$${(Number(slPrice)/1e6).toFixed(2)} tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("7. Set SL on long (-5%)", false, e.message);
  }

  // 8. Set TP on short (position 1) at current_price + 5%
  // Wait, for short TP must be BELOW entry. Let me set TP at current_price - 5% for short.
  // Actually looking at the validation: Short TP must be below entry. Since entry = current_price at open,
  // and price hasn't changed much, we need tp < entry_price. Let's use current_price - 5%.
  try {
    const tpPrice = currentPrice * 95n / 100n;
    const posIdx = Buffer.from([1]);
    const slNone = Buffer.from([0]);
    const tpSome = Buffer.concat([Buffer.from([1]), u64Le(tpPrice)]);
    const data = Buffer.concat([DISC.set_sl_tp, posIdx, slNone, tpSome]);

    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: false },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: false },
        ],
        data,
      }),
    ]);
    step("8. Set TP on short (-5%)", true, `tp=$${(Number(tpPrice)/1e6).toFixed(2)} tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("8. Set TP on short (-5%)", false, e.message);
  }

  // 9. Check positions are open and healthy
  try {
    await sleep(2_000); // Extra wait for RPC consistency
    const accInfo = await connection.getAccountInfo(marginAccount, "confirmed");
    if (!accInfo) throw new Error("Margin account not found");
    const posStart = 8 + 32 + 8; // disc + owner + collateral
    let openCount = 0;
    const posDetails = [];
    for (let i = 0; i < 5; i++) {
      const offset = posStart + i * 61; // 1 tag + 60 bytes
      const tag = accInfo.data[offset];
      posDetails.push(`[${i}]=${tag}`);
      if (tag === 1) openCount++;
    }
    step("9. Positions open", openCount >= 2, `${openCount} open: ${posDetails.join(" ")}`);
  } catch (e) {
    step("9. Positions open", false, e.message);
  }

  // 10. Close long position manually (position 0)
  try {
    const posIdx = Buffer.from([0]);
    const data = Buffer.concat([DISC.close_position, posIdx]);

    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: false },
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
    step("10. Close long manually", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("10. Close long manually", false, e.message);
  }

  // 11. Verify margin account updated (position 0 should be None now)
  try {
    const accInfo = await connection.getAccountInfo(marginAccount);
    const collateral = accInfo.data.readBigUInt64LE(8 + 32);
    const posStart = 8 + 32 + 8;
    const pos0Open = accInfo.data[posStart] === 1;
    const pos1Open = accInfo.data[posStart + 61] === 1;
    step("11. Long closed, free collateral updated", !pos0Open, `pos0=${pos0Open?"OPEN":"CLOSED"} pos1=${pos1Open?"OPEN":"CLOSED"} free_collateral=${Number(collateral)/1e6}`);
  } catch (e) {
    step("11. Verify state", false, e.message);
  }

  // 12. Close short position too (position 1) to clean up
  try {
    const posIdx = Buffer.from([1]);
    const data = Buffer.concat([DISC.close_position, posIdx]);

    const sig = await sendTx(connection, payer, [
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: userPubkey, isSigner: true, isWritable: true },
          { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
          { pubkey: marginAccount, isSigner: false, isWritable: true },
          { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: false },
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
    step("12. Close short (cleanup)", true, `tx=${sig.slice(0, 16)}…`);
  } catch (e) {
    step("12. Close short (cleanup)", false, e.message);
  }

  // 13. Summary
  console.log("\n=== Summary ===\n");
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  for (const r of results) {
    console.log(`  ${r.pass ? "PASS" : "FAIL"} ${r.name}`);
  }
  console.log(`\n  ${passed} passed, ${failed} failed out of ${results.length} steps\n`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
