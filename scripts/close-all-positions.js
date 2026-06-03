"use strict";

/**
 * Close all open positions on devnet via admin liquidation.
 * Sets oracle price to 1 to make all positions liquidatable, then liquidates them.
 * Run: node scripts/close-all-positions.js
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
} = require("@solana/spl-token");

const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || "/Users/ethangriffin/.config/solana/id.json";
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ");

const PROTOCOL_STATE = new PublicKey("8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK");
const ORACLE_PUBKEY = new PublicKey("2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12");
const FEE_VAULT = new PublicKey("GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581");
const INS_FUND = new PublicKey("9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F");
const USDC_MINT = new PublicKey("Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi");

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

// MarginAccount layout (old, pre-migration):
// 8 disc + 32 owner + 8 collateral + 5*(1 + 60 Position) + 1 bump + 32 padding
// Position: 1 direction + 8 coll + 8 notional + 1 leverage + 8 entry + 8 open_ts + 8 last_fund_ts + 9 sl + 9 tp = 60
const MARGIN_DISC_SIZE = 8;
const POSITION_SIZE = 60;
const POSITION_OFFSET = MARGIN_DISC_SIZE + 32 + 8; // after disc + owner + collateral

async function main() {
  console.log("\n=== Close All Positions (Devnet Migration) ===\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const admin = loadKeypair(ADMIN_KEYPAIR_PATH);
  console.log(`Admin: ${admin.publicKey.toBase58()}`);

  // Step 1: Find all margin accounts (program accounts with margin discriminator)
  const marginDisc = createHash("sha256").update("account:MarginAccount").digest().slice(0, 8);

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: Buffer.from(marginDisc).toString("base64"), encoding: "base64" } }],
  });

  console.log(`Found ${accounts.length} margin accounts\n`);

  // Step 2: Find which ones have open positions
  const withPositions = [];
  for (const { pubkey, account } of accounts) {
    const data = account.data;
    const owner = new PublicKey(data.slice(8, 40));

    for (let i = 0; i < 5; i++) {
      const offset = POSITION_OFFSET + i * (1 + POSITION_SIZE);
      const optionTag = data[offset];
      if (optionTag === 1) { // Some(position)
        const direction = data[offset + 1]; // 0=Long, 1=Short
        withPositions.push({ marginPubkey: pubkey, owner, positionIndex: i, direction: direction === 0 ? "Long" : "Short" });
      }
    }
  }

  if (withPositions.length === 0) {
    console.log("No open positions found. Ready to deploy.\n");
    return;
  }

  console.log(`Found ${withPositions.length} open position(s):`);
  for (const p of withPositions) {
    console.log(`  Owner: ${p.owner.toBase58()} slot=${p.positionIndex} dir=${p.direction}`);
  }

  // Step 3: Update oracle to extreme price to make all positions liquidatable
  // Set price to 1 (makes longs liquidatable) then liquidate
  console.log("\nSetting oracle price to 1 to force liquidations...");

  const updateOracleDisc = disc("update_oracle");
  const extremePrice = 1_000_000; // $1 in 6 decimals — longs will be deep underwater

  const updateIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
      { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([updateOracleDisc, u64Le(extremePrice)]),
  });

  try {
    const sig = await sendTx(connection, admin, [updateIx]);
    console.log(`  Oracle updated to $1.00: ${sig}`);
  } catch (e) {
    console.error("  Failed to update oracle:", e.message);
    // Try with secondary authority approach or market oracle
  }

  // Wait for confirmation
  await new Promise(r => setTimeout(r, 2000));

  // Step 4: Liquidate each position
  const liquidateDisc = disc("liquidate");
  const adminAta = getAssociatedTokenAddressSync(USDC_MINT, admin.publicKey, false);

  for (const p of withPositions) {
    console.log(`\nLiquidating ${p.owner.toBase58()} slot=${p.positionIndex}...`);

    const userBuf = p.owner.toBuffer();
    const posIdxBuf = Buffer.from([p.positionIndex]);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },   // liquidator
        { pubkey: p.owner, isSigner: false, isWritable: false },          // user
        { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },    // protocol_state
        { pubkey: p.marginPubkey, isSigner: false, isWritable: true },    // margin_account
        { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: false },    // oracle
        { pubkey: FEE_VAULT, isSigner: false, isWritable: true },         // fee_vault
        { pubkey: INS_FUND, isSigner: false, isWritable: true },          // insurance_fund
        { pubkey: adminAta, isSigner: false, isWritable: true },          // liquidator_token_account
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      ],
      data: Buffer.concat([liquidateDisc, userBuf, posIdxBuf]),
    });

    try {
      const sig = await sendTx(connection, admin, [ix]);
      console.log(`  Liquidated: ${sig}`);
    } catch (e) {
      console.error(`  Failed: ${e.message}`);

      // If it's a short, try setting price to $999999
      if (p.direction === "Short") {
        console.log("  Retrying with high price for short position...");
        const highPrice = 999_999_000_000; // $999999
        const updateIx2 = new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: admin.publicKey, isSigner: true, isWritable: true },
            { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
            { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: true },
          ],
          data: Buffer.concat([updateOracleDisc, u64Le(highPrice)]),
        });
        try {
          await sendTx(connection, admin, [updateIx2]);
          await new Promise(r => setTimeout(r, 2000));
          const sig2 = await sendTx(connection, admin, [ix]);
          console.log(`  Liquidated (retry): ${sig2}`);
        } catch (e2) {
          console.error(`  Retry failed: ${e2.message}`);
        }
      }
    }
  }

  // Step 5: Restore oracle to reasonable price
  console.log("\nRestoring oracle price to ~$158...");
  const restorePrice = 158_000_000;
  const restoreIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: true },
      { pubkey: ORACLE_PUBKEY, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([updateOracleDisc, u64Le(restorePrice)]),
  });
  try {
    const sig = await sendTx(connection, admin, [restoreIx]);
    console.log(`  Oracle restored: ${sig}`);
  } catch (e) {
    console.error("  Failed to restore oracle:", e.message);
  }

  console.log("\nDone. All positions should be closed.\n");
}

main().catch(console.error);
