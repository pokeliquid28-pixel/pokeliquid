/**
 * Create a Squads v4 proposal to publish verified build info on-chain.
 *
 * This submits the solana-verify PDA transaction through the multisig,
 * linking the on-chain program to its public source repo.
 *
 * Usage:
 *   npx ts-node scripts/propose-verify-program.ts
 */

import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, Transaction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";

// ═══════════════════════════════════════════════════════════════════════════════
const MULTISIG_PDA = new PublicKey("FrWkMavwdbRYqBGQnJa92uHgL9CQJBWSCRmqaq9rFNTG");
const MULTISIG_VAULT = new PublicKey("DAfMBNwvbkRpMXTsa5uHLR4Ac92c696y5dzguF8J11zd");
const HELIUS_RPC = process.env.HELIUS_RPC!;

// Base58 encoded transaction from: solana-verify export-pda-tx
const VERIFY_TX_BASE58 = "AjZrCkkCRm2JFeKB9zpHUZwVBCWvnvuUZ57vpi9zjcEMfdNQBmp1oyyNod3MT9WAGBU5A9hQ35rk6NmXSPn3gmDtm7e2gNpcycDuE84FZ8j9MY5y8R9AZzARNxFzaXftJokPP1bvtrdgDi33DDBUzKH7TbZQa1gGdxVFtQ5GExAWHgxvy1VWNXYHrqFm6wVXHD1BLft9qpfnJve4ki8k55S7iBVRP5GaxJWrhNfXkndVEnoCzhaQxcs99T6EoS92JCvd9wKnSwseb7ZC11HgmN2j3m6YWUZ9D1dpxJbiZcE2TJB6a6hbYodmQPkpHKpEYjDevs76v29qS58no8eAjFvbD7jUdGpYp35vSHo8k6fwUxyhZJjqX84WMcTR5t4MQGrEWpE171kfF576SFEjryFUEQTvbdSW6vz8mbzx82A9rbJVAhZfmzQ9b4mmaviF1kFRrQCn9Zwd8eD4rtvbY9fkAp9wsKUi7UgoDkJgqavmYandvJ9YkNJZmAeLMJKgCDZ3LHxKHCjLaSPUhg21bmQTnbJKKY7BCGB6iFnDKm37SjX7WV2d7DGQk8mJhMTLbSycMF1n86JfNkaHvvVCWqeBqA2vzV2Dd216fVBYCoFTDKhHatz7E5rSEgC8Vizsx42b67jeLrYUYhQPMFhCxJLBwjAxyVHEPtLnpCM6oLq5pT";
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const connection = new Connection(HELIUS_RPC, "confirmed");
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const creator = Keypair.fromSecretKey(new Uint8Array(keyData));

  console.log("Creator:", creator.publicKey.toBase58());

  // Decode the exported transaction to extract the instruction
  const txBytes = bs58.decode(VERIFY_TX_BASE58);
  const legacyTx = Transaction.from(txBytes);
  // Ix 0 is ComputeBudget, Ix 1 is the actual verify instruction
  const verifyIx = legacyTx.instructions[1];

  console.log("Verify instruction program:", verifyIx.programId.toBase58());
  console.log("Verify instruction accounts:", verifyIx.keys.length);

  // Fetch multisig state
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG_PDA);
  const currentIndex = Number(multisigAccount.transactionIndex);
  const newIndex = BigInt(currentIndex + 1);
  console.log("Transaction index:", newIndex.toString());

  // Wrap in vault transaction
  const { blockhash } = await connection.getLatestBlockhash();
  const txMessage = new TransactionMessage({
    payerKey: MULTISIG_VAULT,
    recentBlockhash: blockhash,
    instructions: [verifyIx],
  });

  const vtCreateIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: MULTISIG_PDA,
    transactionIndex: newIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: txMessage,
  });

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

  const { blockhash: recentBlockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: creator.publicKey,
    recentBlockhash,
    instructions: [vtCreateIx, proposalCreateIx, proposalApproveIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([creator]);

  console.log("\nSending proposal...");
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  console.log("Sent:", sig);
  await connection.confirmTransaction(sig, "confirmed");
  console.log("Confirmed!");

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Program Verification Proposal Created");
  console.log("═══════════════════════════════════════════════════");
  console.log("  Transaction #" + newIndex.toString());
  console.log(`  Needs ${multisigAccount.threshold} approvals — approve + execute in Squads UI.`);
  console.log("═══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exit(1); });
