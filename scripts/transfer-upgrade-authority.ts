/**
 * Transfer program upgrade authority to the Squads multisig vault.
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/transfer-upgrade-authority.ts
 *
 * ⚠️  This is irreversible — after running, only the multisig can upgrade the program.
 */

import { execSync } from "child_process";
import { Connection, PublicKey } from "@solana/web3.js";

// ═══════════════════════════════════════════════════════════════════════════════
// ██  PASTE YOUR SQUADS VAULT ADDRESS HERE  ██
const MULTISIG_VAULT = "DAfMBNwvbkRpMXTsa5uHLR4Ac92c696y5dzguF8J11zd";
// ═══════════════════════════════════════════════════════════════════════════════

const PROGRAM_ID = "5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6";
const RPC = process.env.HELIUS_RPC!;

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Check current upgrade authority
  const programInfo = await connection.getAccountInfo(new PublicKey(PROGRAM_ID));
  if (!programInfo) {
    console.error("❌ Program not found");
    process.exit(1);
  }

  console.log("Program ID:           ", PROGRAM_ID);
  console.log("Target upgrade auth:  ", MULTISIG_VAULT);
  console.log("\n⚠️  This will transfer upgrade authority to the multisig.");
  console.log("   After this, ONLY the multisig can upgrade the program.");
  console.log("   Press Ctrl+C within 5 seconds to abort...\n");
  await new Promise(r => setTimeout(r, 5000));

  const walletPath = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;

  try {
    const cmd = `solana program set-upgrade-authority ${PROGRAM_ID} --new-upgrade-authority ${MULTISIG_VAULT} --skip-new-upgrade-authority-signer-check --keypair ${walletPath} --url ${RPC}`;
    console.log("Running:", cmd);
    const output = execSync(cmd, { encoding: "utf8" });
    console.log(output);
    console.log("✅ Upgrade authority transferred!");
  } catch (e: any) {
    console.error("❌ Failed:", e.stderr || e.message);
    process.exit(1);
  }

  // Verify
  console.log("\nVerifying...");
  try {
    const output = execSync(
      `solana program show ${PROGRAM_ID} --url ${RPC}`,
      { encoding: "utf8" }
    );
    console.log(output);
    if (output.includes(MULTISIG_VAULT)) {
      console.log("✅ PASS — upgrade authority matches multisig vault");
    } else {
      console.log("❌ FAIL — upgrade authority does NOT match");
    }
  } catch (e: any) {
    console.error("Verification failed:", e.message);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
