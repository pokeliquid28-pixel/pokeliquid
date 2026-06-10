/**
 * Extend program data account to fit a larger binary.
 * ExtendProgram (instruction index 6) is permissionless — any payer can extend.
 *
 * Usage:
 *   ADDITIONAL_BYTES=21512 npx ts-node scripts/extend-program.ts
 */

import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const PROGRAM_DATA = new PublicKey("7NApmF34w97TZM8CMQ42G2AqSADFED3zsJwjoVY1wRyn");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
const HELIUS_RPC = process.env.HELIUS_RPC!;

async function main() {
  const additionalBytes = parseInt(process.env.ADDITIONAL_BYTES || "21512");
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const connection = new Connection(HELIUS_RPC, "confirmed");
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const payer = Keypair.fromSecretKey(new Uint8Array(keyData));

  console.log("Payer:           ", payer.publicKey.toBase58());
  console.log("Program:         ", PROGRAM_ID.toBase58());
  console.log("ProgramData:     ", PROGRAM_DATA.toBase58());
  console.log("Additional bytes:", additionalBytes);

  // BPFLoaderUpgradeable::ExtendProgram = instruction index 6
  // Data layout: [6, 0, 0, 0] (u32 LE) + [additional_bytes as u32 LE]
  const data = Buffer.alloc(8);
  data.writeUInt32LE(6, 0);        // instruction index
  data.writeUInt32LE(additionalBytes, 4); // additional bytes

  const extendIx = new TransactionInstruction({
    programId: BPF_LOADER,
    keys: [
      { pubkey: PROGRAM_DATA,    isSigner: false, isWritable: true },  // programdata account
      { pubkey: PROGRAM_ID,      isSigner: false, isWritable: true },  // program account
      { pubkey: SYSTEM_PROGRAM,  isSigner: false, isWritable: false }, // system program
      { pubkey: payer.publicKey,  isSigner: true,  isWritable: true },  // payer (anyone)
    ],
    data,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [extendIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([payer]);

  console.log("\nSending extend transaction...");
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  console.log("Sent:", sig);
  await connection.confirmTransaction(sig, "confirmed");
  console.log("Confirmed! Program data extended by", additionalBytes, "bytes.");
}

main().catch((e) => { console.error(e); process.exit(1); });
