/**
 * Create Squads v4 proposals to initialize PL500 oracle + market state.
 *
 * Creates TWO vault transactions (must be executed in order):
 *   1. init_market_oracle  — creates oracle PDA with seed price $103,632
 *   2. init_market_state   — creates market state PDA with 100k max OI
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/propose-init-pl500.ts
 *
 * After running, get 2nd approval in Squads UI, then execute TX #1, then TX #2.
 */

import { Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
const MULTISIG_PDA = new PublicKey("FrWkMavwdbRYqBGQnJa92uHgL9CQJBWSCRmqaq9rFNTG");
const MULTISIG_VAULT = new PublicKey("DAfMBNwvbkRpMXTsa5uHLR4Ac92c696y5dzguF8J11zd");
const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const PROTOCOL_STATE = new PublicKey("6yAYSsp863889v7bhMEwj6tVq5DvFTi1gwzwHFrqwLFL");
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=358c9ec3-db8b-46a1-ac6c-d702d3a19340";
// ═══════════════════════════════════════════════════════════════════════════════

const MARKET_ID = "PL500";
const SEED_PRICE = BigInt(103_632_000_000); // $103,632 * 1e6
const MAX_OI = BigInt(100_000_000_000);     // 100k USDC * 1e6

function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64Le(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s);
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

async function main() {
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const connection = new Connection(HELIUS_RPC, "confirmed");
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const creator = Keypair.fromSecretKey(new Uint8Array(keyData));

  const marketIdBytes = Buffer.from(MARKET_ID);

  const [oraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle"), marketIdBytes],
    PROGRAM_ID
  );
  const [marketStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketIdBytes],
    PROGRAM_ID
  );

  console.log("Creator:          ", creator.publicKey.toBase58());
  console.log("Multisig vault:   ", MULTISIG_VAULT.toBase58());
  console.log("PL500 Oracle PDA: ", oraclePda.toBase58());
  console.log("PL500 Market PDA: ", marketStatePda.toBase58());

  // Verify vault derivation
  const [derivedVault] = multisig.getVaultPda({ multisigPda: MULTISIG_PDA, index: 0 });
  if (!derivedVault.equals(MULTISIG_VAULT)) {
    console.error("ERROR: Vault PDA mismatch!");
    process.exit(1);
  }
  console.log("Vault verified OK\n");

  // Check if oracle already exists
  const oracleExists = await connection.getAccountInfo(oraclePda);
  const marketExists = await connection.getAccountInfo(marketStatePda);

  // Fetch multisig state
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG_PDA);
  let currentIndex = Number(multisigAccount.transactionIndex);
  console.log("Current tx index: ", currentIndex);
  console.log("Threshold:        ", multisigAccount.threshold);

  // ── TX 1: init_market_oracle ──────────────────────────────────────────────
  if (oracleExists) {
    console.log("\nOracle already exists — skipping init_market_oracle proposal.");
  } else {
    const newIndex = BigInt(currentIndex + 1);
    console.log(`\n--- Creating proposal #${newIndex}: init_market_oracle ---`);

    // Check if vault transaction already exists (from a partial previous run)
    const [vtPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("multisig"),
        MULTISIG_PDA.toBuffer(),
        Buffer.from("transaction"),
        new Uint8Array(new BigUint64Array([newIndex]).buffer),
      ],
      new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf")
    );
    const vtExists = await connection.getAccountInfo(vtPda);
    const skipVtCreate = !!vtExists;

    const initOracleIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: MULTISIG_VAULT, isSigner: true, isWritable: true },
        { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
        { pubkey: oraclePda,      isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        disc("init_market_oracle"),
        encodeString(MARKET_ID),
        u64Le(SEED_PRICE),
      ]),
    });

    const { blockhash } = await connection.getLatestBlockhash();
    const txMessage = new TransactionMessage({
      payerKey: MULTISIG_VAULT,
      recentBlockhash: blockhash,
      instructions: [initOracleIx],
    });

    const vtCreateIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: MULTISIG_PDA,
      transactionIndex: newIndex,
      creator: creator.publicKey,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: txMessage,
    });

    // Send vaultTransactionCreate first (needs most rent)
    if (skipVtCreate) {
      console.log(`  VaultTransaction #${newIndex} already exists, skipping create.`);
    } else {
      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: creator.publicKey,
        recentBlockhash: blockhash,
        instructions: [vtCreateIx],
      }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([creator]);
      const sig = await connection.sendTransaction(tx, { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  VaultTransaction created: ${sig}`);
    }

    // Then proposalCreate + approve in a second tx
    const proposalCreateIx = multisig.instructions.proposalCreate({
      multisigPda: MULTISIG_PDA,
      transactionIndex: newIndex,
      creator: creator.publicKey,
    });

    const proposalApproveIx = multisig.instructions.proposalApprove({
      multisigPda: MULTISIG_PDA,
      transactionIndex: newIndex,
      member: creator.publicKey,
    });

    {
      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: creator.publicKey,
        recentBlockhash: blockhash,
        instructions: [proposalCreateIx, proposalApproveIx],
      }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([creator]);
      const sig = await connection.sendTransaction(tx, { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  Proposal #${newIndex} created + approved: ${sig}`);
    }
    currentIndex++;
  }

  // ── TX 2: init_market_state ───────────────────────────────────────────────
  if (marketExists) {
    console.log("\nMarket state already exists — skipping init_market_state proposal.");
  } else {
    const newIndex = BigInt(currentIndex + 1);
    console.log(`\n--- Creating proposal #${newIndex}: init_market_state ---`);

    const initStateIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: MULTISIG_VAULT, isSigner: true, isWritable: true },
        { pubkey: PROTOCOL_STATE, isSigner: false, isWritable: false },
        { pubkey: oraclePda,      isSigner: false, isWritable: false },
        { pubkey: marketStatePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        disc("init_market_state"),
        encodeString(MARKET_ID),
        u64Le(MAX_OI),
        u64Le(MAX_OI),
      ]),
    });

    const { blockhash } = await connection.getLatestBlockhash();
    const txMessage = new TransactionMessage({
      payerKey: MULTISIG_VAULT,
      recentBlockhash: blockhash,
      instructions: [initStateIx],
    });

    const vtCreateIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: MULTISIG_PDA,
      transactionIndex: newIndex,
      creator: creator.publicKey,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: txMessage,
    });

    // Send vaultTransactionCreate first
    {
      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: creator.publicKey,
        recentBlockhash: blockhash,
        instructions: [vtCreateIx],
      }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([creator]);
      const sig = await connection.sendTransaction(tx, { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  VaultTransaction created: ${sig}`);
    }

    // Then proposalCreate + approve
    const proposalCreateIx = multisig.instructions.proposalCreate({
      multisigPda: MULTISIG_PDA,
      transactionIndex: newIndex,
      creator: creator.publicKey,
    });

    const proposalApproveIx = multisig.instructions.proposalApprove({
      multisigPda: MULTISIG_PDA,
      transactionIndex: newIndex,
      member: creator.publicKey,
    });

    {
      const { blockhash } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: creator.publicKey,
        recentBlockhash: blockhash,
        instructions: [proposalCreateIx, proposalApproveIx],
      }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([creator]);
      const sig = await connection.sendTransaction(tx, { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  Proposal #${newIndex} created + approved: ${sig}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n===================================================");
  console.log("  PL500 Proposals Created");
  console.log("===================================================");
  console.log("  Oracle PDA:       ", oraclePda.toBase58());
  console.log("  Market State PDA: ", marketStatePda.toBase58());
  console.log("  Seed Price:        $103,632");
  console.log("  Max OI:            100k USDC (long + short)");
  console.log("");
  console.log("  Next steps:");
  console.log("  1. Get 2nd approval in Squads UI (https://v4.squads.so/)");
  console.log("  2. Execute TX #1 (init_market_oracle) first");
  console.log("  3. Execute TX #2 (init_market_state) after TX #1 confirms");
  console.log("  4. Restart keeper: ssh root@157.180.67.25 'pm2 restart keeper'");
  console.log("  5. Deploy frontend: git push origin main");
  console.log("===================================================");
}

main().catch((e) => { console.error(e); process.exit(1); });
