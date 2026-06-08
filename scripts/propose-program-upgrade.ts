/**
 * Create a Squads v4 proposal to upgrade the program using a pre-uploaded buffer.
 *
 * Prerequisites:
 *   1. Build: anchor build -- --features mainnet
 *   2. Upload buffer: solana program write-buffer target/deploy/pokeliquid.so --url <RPC>
 *   3. Transfer buffer authority: solana program set-buffer-authority <BUFFER> --new-buffer-authority <VAULT>
 *
 * Usage:
 *   BUFFER=<buffer_address> npx ts-node scripts/propose-program-upgrade.ts
 */

import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
const MULTISIG_PDA = new PublicKey("FrWkMavwdbRYqBGQnJa92uHgL9CQJBWSCRmqaq9rFNTG");
const MULTISIG_VAULT = new PublicKey("DAfMBNwvbkRpMXTsa5uHLR4Ac92c696y5dzguF8J11zd");
const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const PROGRAM_DATA = new PublicKey("7NApmF34w97TZM8CMQ42G2AqSADFED3zsJwjoVY1wRyn");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const HELIUS_RPC = process.env.HELIUS_RPC!;
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const bufferAddress = process.env.BUFFER;
  if (!bufferAddress) {
    console.error("ERROR: Set BUFFER env var to the program buffer address");
    console.error("  BUFFER=<address> npx ts-node scripts/propose-program-upgrade.ts");
    process.exit(1);
  }
  const buffer = new PublicKey(bufferAddress);

  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const connection = new Connection(HELIUS_RPC, "confirmed");
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const creator = Keypair.fromSecretKey(new Uint8Array(keyData));

  console.log("Creator:        ", creator.publicKey.toBase58());
  console.log("Program:        ", PROGRAM_ID.toBase58());
  console.log("Buffer:         ", buffer.toBase58());
  console.log("Multisig vault: ", MULTISIG_VAULT.toBase58());

  // Verify buffer exists and authority is the vault
  const bufferInfo = await connection.getAccountInfo(buffer);
  if (!bufferInfo) {
    console.error("ERROR: Buffer account not found");
    process.exit(1);
  }
  // Buffer authority is at offset 5 (4 byte enum + 1 byte option tag + 32 byte pubkey)
  const bufferAuth = new PublicKey(bufferInfo.data.slice(5, 37));
  if (!bufferAuth.equals(MULTISIG_VAULT)) {
    console.error("ERROR: Buffer authority is not the multisig vault!");
    console.error("  Buffer authority:", bufferAuth.toBase58());
    console.error("  Expected:        ", MULTISIG_VAULT.toBase58());
    console.error("  Run: solana program set-buffer-authority", buffer.toBase58(), "--new-buffer-authority", MULTISIG_VAULT.toBase58());
    process.exit(1);
  }
  console.log("Buffer authority: OK (matches vault)");

  // Fetch multisig state
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, MULTISIG_PDA);
  const currentIndex = Number(multisigAccount.transactionIndex);
  const newIndex = BigInt(currentIndex + 1);
  console.log("\nTransaction index:", newIndex.toString());
  console.log("Threshold:        ", multisigAccount.threshold);

  // Build BPFLoaderUpgradeable::Upgrade instruction
  // Instruction index 3 = Upgrade
  // Data: [3, 0, 0, 0] (u32 LE)
  const upgradeIx = new TransactionInstruction({
    programId: BPF_LOADER,
    keys: [
      { pubkey: PROGRAM_DATA,          isSigner: false, isWritable: true },   // programdata
      { pubkey: PROGRAM_ID,            isSigner: false, isWritable: true },   // program
      { pubkey: buffer,                isSigner: false, isWritable: true },   // buffer
      { pubkey: MULTISIG_VAULT,        isSigner: true,  isWritable: true },   // spill (receives buffer lamports)
      { pubkey: SYSVAR_RENT_PUBKEY,    isSigner: false, isWritable: false },  // rent
      { pubkey: SYSVAR_CLOCK_PUBKEY,   isSigner: false, isWritable: false },  // clock
      { pubkey: MULTISIG_VAULT,        isSigner: true,  isWritable: false },  // authority
    ],
    data: Buffer.from([3, 0, 0, 0]),
  });

  // Wrap in vault transaction message
  const { blockhash } = await connection.getLatestBlockhash();
  const txMessage = new TransactionMessage({
    payerKey: MULTISIG_VAULT,
    recentBlockhash: blockhash,
    instructions: [upgradeIx],
  });

  // Create vault transaction + proposal + approve
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

  console.log("\nSending proposal transaction...");
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  console.log("Sent:", sig);
  await connection.confirmTransaction(sig, "confirmed");
  console.log("Confirmed!");

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Program Upgrade Proposal Created");
  console.log("═══════════════════════════════════════════════════");
  console.log("  Transaction #" + newIndex.toString());
  console.log("  Buffer:", buffer.toBase58());
  console.log(`  Needs ${multisigAccount.threshold} approvals — go to Squads UI to approve + execute.`);
  console.log("═══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exit(1); });
