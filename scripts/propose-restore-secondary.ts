/**
 * Create a Squads v4 proposal to restore secondary_authority on ProtocolState.
 *
 * This script:
 *   1. Builds the update_params instruction with secondary_authority set
 *   2. Creates a vault transaction in the Squads multisig
 *   3. Creates and activates a proposal
 *   4. Auto-approves (if the signer is a multisig member)
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/propose-restore-secondary.ts
 *
 * After running, approve the proposal in the Squads UI if threshold > 1,
 * then execute it.
 */

import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
const MULTISIG_PDA = new PublicKey("FrWkMavwdbRYqBGQnJa92uHgL9CQJBWSCRmqaq9rFNTG");
const MULTISIG_VAULT = new PublicKey("DAfMBNwvbkRpMXTsa5uHLR4Ac92c696y5dzguF8J11zd");
const SECONDARY_AUTHORITY = new PublicKey("2XsE4rWJa7LRjFWfMFUmWFxBeqNaKmuXdfJk5iWy1ssH");
const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const HELIUS_RPC = process.env.HELIUS_RPC!;
// ═══════════════════════════════════════════════════════════════════════════════

const PROTOCOL_SEED = Buffer.from("protocol");
const ORACLE_SEED = Buffer.from("oracle");
const LP_POOL_SEED = Buffer.from("liquidity_pool");

async function main() {
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const connection = new Connection(HELIUS_RPC, "confirmed");
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const creator = Keypair.fromSecretKey(new Uint8Array(keyData));

  console.log("Creator (your wallet):", creator.publicKey.toBase58());
  console.log("Multisig vault:       ", MULTISIG_VAULT.toBase58());
  console.log("Secondary to restore: ", SECONDARY_AUTHORITY.toBase58());

  // --- Verify vault derivation ---
  const multisigPda = MULTISIG_PDA;
  const [derivedVault] = multisig.getVaultPda({ multisigPda, index: 0 });
  if (!derivedVault.equals(MULTISIG_VAULT)) {
    console.error("ERROR: Vault PDA mismatch!");
    console.error("  Expected:", MULTISIG_VAULT.toBase58());
    console.error("  Derived: ", derivedVault.toBase58());
    process.exit(1);
  }
  console.log("Multisig PDA:         ", multisigPda.toBase58());
  console.log("Vault verified OK");

  // --- Fetch multisig state to get next transaction index ---
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  const currentIndex = Number(multisigAccount.transactionIndex);
  const newIndex = BigInt(currentIndex + 1);
  console.log("\nCurrent transaction index:", currentIndex);
  console.log("New transaction index:    ", newIndex.toString());
  console.log("Threshold:                ", multisigAccount.threshold);
  console.log("Members:                  ", multisigAccount.members.map((m: any) => m.key.toBase58()).join(", "));

  // --- Build the inner update_params instruction ---
  // We need to manually build the instruction since the vault PDA is the signer (admin).
  const idlPath = path.join(__dirname, "../target/idl/pokeliquid.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

  const [protocolState] = PublicKey.findProgramAddressSync([PROTOCOL_SEED], PROGRAM_ID);
  const [oracle] = PublicKey.findProgramAddressSync([ORACLE_SEED], PROGRAM_ID);
  const [liquidityPool] = PublicKey.findProgramAddressSync([LP_POOL_SEED], PROGRAM_ID);

  // Build instruction data manually using the discriminator from IDL
  const discriminator = Buffer.from([108, 178, 190, 95, 94, 203, 116, 20]); // update_params

  // ProtocolParams borsh serialization:
  // Each field is Option<T>: 0 = None, 1 + value = Some
  // Fields in order: fee_bps(u16), base_funding_rate_per_hour(u64), skew_factor(u64),
  //   profit_cap_bps(u16), max_long_exposure(u64), max_short_exposure(u64),
  //   min_position_size(u64), is_paused(bool), staleness_threshold(i64),
  //   secondary_authority(Pubkey), auto_pause_threshold(i64),
  //   insurance_fund_bps(u16), lp_fee_bps(u16), admin(Pubkey)

  const parts: Buffer[] = [discriminator];

  // fee_bps: None
  parts.push(Buffer.from([0]));
  // base_funding_rate_per_hour: None
  parts.push(Buffer.from([0]));
  // skew_factor: None
  parts.push(Buffer.from([0]));
  // profit_cap_bps: None
  parts.push(Buffer.from([0]));
  // max_long_exposure: None
  parts.push(Buffer.from([0]));
  // max_short_exposure: None
  parts.push(Buffer.from([0]));
  // min_position_size: None
  parts.push(Buffer.from([0]));
  // is_paused: None
  parts.push(Buffer.from([0]));
  // staleness_threshold: None
  parts.push(Buffer.from([0]));
  // secondary_authority: Some(SECONDARY_AUTHORITY)
  parts.push(Buffer.from([1]));
  parts.push(SECONDARY_AUTHORITY.toBuffer());
  // auto_pause_threshold: None
  parts.push(Buffer.from([0]));
  // insurance_fund_bps: None
  parts.push(Buffer.from([0]));
  // lp_fee_bps: None
  parts.push(Buffer.from([0]));
  // admin: None
  parts.push(Buffer.from([0]));

  const data = Buffer.concat(parts);

  const { TransactionInstruction } = await import("@solana/web3.js");

  const updateParamsIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: MULTISIG_VAULT, isSigner: true, isWritable: false },  // admin (vault signs)
      { pubkey: protocolState,  isSigner: false, isWritable: true },
      { pubkey: oracle,         isSigner: false, isWritable: true },
      { pubkey: liquidityPool,  isSigner: false, isWritable: true },
    ],
    data,
  });

  // --- Create the vault transaction message ---
  const { blockhash } = await connection.getLatestBlockhash();

  const txMessage = new TransactionMessage({
    payerKey: MULTISIG_VAULT,
    recentBlockhash: blockhash,  // placeholder, not used for execution
    instructions: [updateParamsIx],
  });

  // --- Step 1: Create vault transaction ---
  console.log("\n--- Step 1: Creating vault transaction ---");
  const vtCreateIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex: newIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: txMessage,
  });

  // --- Step 2: Create proposal ---
  console.log("--- Step 2: Creating proposal ---");
  const proposalCreateIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex: newIndex,
    creator: creator.publicKey,
  });

  // --- Step 3: Approve proposal ---
  console.log("--- Step 3: Approving proposal ---");
  const proposalApproveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex: newIndex,
    member: creator.publicKey,
  });

  // Bundle all into one transaction
  const { blockhash: recentBlockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: creator.publicKey,
    recentBlockhash,
    instructions: [vtCreateIx, proposalCreateIx, proposalApproveIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([creator]);

  console.log("\nSending transaction...");
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  console.log("Transaction sent:", sig);

  await connection.confirmTransaction(sig, "confirmed");
  console.log("Confirmed!");

  // --- Summary ---
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Proposal Created Successfully");
  console.log("═══════════════════════════════════════════════════");
  console.log("  Multisig PDA:      ", multisigPda.toBase58());
  console.log("  Transaction index: ", newIndex.toString());
  console.log("  Action:             Restore secondary_authority to", SECONDARY_AUTHORITY.toBase58());
  console.log("");

  if (multisigAccount.threshold <= 1) {
    console.log("  Threshold is 1 — proposal is auto-approved.");
    console.log("  You can now execute it in the Squads UI or via CLI.");
  } else {
    console.log(`  Threshold is ${multisigAccount.threshold} — additional approvals needed.`);
    console.log("  Share this with other multisig members to approve.");
  }

  console.log("\n  Squads UI: https://v4.squads.so/");
  console.log("  Look for transaction #" + newIndex.toString() + " in your multisig.");
  console.log("═══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exit(1); });
