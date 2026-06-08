/**
 * Verify that multisig setup is complete.
 *
 * Checks:
 *   1. ProtocolState.admin == Squads vault
 *   2. Program upgrade authority == Squads vault
 *   3. ProtocolState.secondary_authority == keeper oracle key
 *
 * Usage:
 *   npx ts-node scripts/verify-multisig-setup.ts
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@anchor-lang/core";
import * as anchor from "@anchor-lang/core";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ═══════════════════════════════════════════════════════════════════════════════
// ██  PASTE YOUR SQUADS VAULT ADDRESS HERE  ██
const MULTISIG_VAULT = new PublicKey("DAfMBNwvbkRpMXTsa5uHLR4Ac92c696y5dzguF8J11zd");
// ═══════════════════════════════════════════════════════════════════════════════

const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const EXPECTED_SECONDARY = new PublicKey("2XsE4rWJa7LRjFWfMFUmWFxBeqNaKmuXdfJk5iWy1ssH");
const PROTOCOL_SEED = Buffer.from("protocol");
const RPC = "https://api.mainnet-beta.solana.com";

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Dummy wallet for read-only provider
  const wallet = { publicKey: MULTISIG_VAULT, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t };
  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });

  const idlPath = path.join(__dirname, "../target/idl/pokeliquid.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new Program(idl as any, provider) as any;

  const [protocolState] = PublicKey.findProgramAddressSync([PROTOCOL_SEED], PROGRAM_ID);

  console.log("═══════════════════════════════════════════════════");
  console.log("  Pokeliquid Multisig Verification");
  console.log("═══════════════════════════════════════════════════\n");

  let allPass = true;

  // Check 1: ProtocolState.admin
  const state = await program.account.protocolState.fetch(protocolState);
  const adminMatch = state.admin.equals(MULTISIG_VAULT);
  console.log(`1. ProtocolState.admin`);
  console.log(`   Expected: ${MULTISIG_VAULT.toBase58()}`);
  console.log(`   Actual:   ${state.admin.toBase58()}`);
  console.log(`   ${adminMatch ? "✅ PASS" : "❌ FAIL"}\n`);
  if (!adminMatch) allPass = false;

  // Check 2: Program upgrade authority
  let upgradeMatch = false;
  try {
    const output = execSync(
      `solana program show ${PROGRAM_ID.toBase58()} --url ${RPC}`,
      { encoding: "utf8" }
    );
    const authLine = output.split("\n").find(l => l.includes("Authority"));
    const currentAuth = authLine?.split(":").pop()?.trim() || "unknown";
    upgradeMatch = currentAuth === MULTISIG_VAULT.toBase58();
    console.log(`2. Program upgrade authority`);
    console.log(`   Expected: ${MULTISIG_VAULT.toBase58()}`);
    console.log(`   Actual:   ${currentAuth}`);
    console.log(`   ${upgradeMatch ? "✅ PASS" : "❌ FAIL"}\n`);
  } catch {
    console.log(`2. Program upgrade authority`);
    console.log(`   ❌ FAIL — could not read (solana CLI required)\n`);
  }
  if (!upgradeMatch) allPass = false;

  // Check 3: Secondary authority (keeper oracle key)
  const secMatch = state.secondaryAuthority.equals(EXPECTED_SECONDARY);
  console.log(`3. ProtocolState.secondary_authority (keeper)`);
  console.log(`   Expected: ${EXPECTED_SECONDARY.toBase58()}`);
  console.log(`   Actual:   ${state.secondaryAuthority.toBase58()}`);
  console.log(`   ${secMatch ? "✅ PASS" : "❌ FAIL"}\n`);
  if (!secMatch) allPass = false;

  console.log("═══════════════════════════════════════════════════");
  console.log(allPass ? "  ALL CHECKS PASSED ✅" : "  SOME CHECKS FAILED ❌");
  console.log("═══════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exit(1); });
