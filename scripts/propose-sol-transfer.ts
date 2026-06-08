/**
 * Create a Squads proposal to send SOL from the vault to a recipient.
 *
 * Usage:
 *   AMOUNT=4.5 RECIPIENT=2iVcXi6XXkm1X6w4qLbVvzC1fZ3yS57HxEyn5ghWopak \
 *   npx ts-node scripts/propose-sol-transfer.ts
 */

import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import * as fs from "fs";
import * as path from "path";

const MULTISIG_PDA = new PublicKey("FrWkMavwdbRYqBGQnJa92uHgL9CQJBWSCRmqaq9rFNTG");
const MULTISIG_VAULT = new PublicKey("DAfMBNwvbkRpMXTsa5uHLR4Ac92c696y5dzguF8J11zd");
const HELIUS_RPC = process.env.HELIUS_RPC!;

async function main() {
  const amount = parseFloat(process.env.AMOUNT || "0");
  const recipient = process.env.RECIPIENT;
  if (!amount || !recipient) {
    console.error("Usage: AMOUNT=4.5 RECIPIENT=<pubkey> npx ts-node scripts/propose-sol-transfer.ts");
    process.exit(1);
  }

  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const connection = new Connection(HELIUS_RPC, "confirmed");
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const creator = Keypair.fromSecretKey(new Uint8Array(keyData));
  const recipientPubkey = new PublicKey(recipient);

  console.log("From vault: ", MULTISIG_VAULT.toBase58());
  console.log("To:         ", recipientPubkey.toBase58());
  console.log("Amount:     ", amount, "SOL");

  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG_PDA);
  const newIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

  const transferIx = SystemProgram.transfer({
    fromPubkey: MULTISIG_VAULT,
    toPubkey: recipientPubkey,
    lamports: Math.round(amount * LAMPORTS_PER_SOL),
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const txMessage = new TransactionMessage({
    payerKey: MULTISIG_VAULT,
    recentBlockhash: blockhash,
    instructions: [transferIx],
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

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  SOL Transfer Proposal #" + newIndex.toString());
  console.log("  " + amount + " SOL → " + recipientPubkey.toBase58());
  console.log(`  Needs ${multisigAccount.threshold} approvals in Squads UI.`);
  console.log("═══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exit(1); });
