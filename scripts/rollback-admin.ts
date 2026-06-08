/**
 * Rollback: transfer ProtocolState admin back from the multisig vault to the original admin.
 *
 * This ONLY works if:
 *   - The current signer IS the on-chain admin (i.e., you haven't transferred yet,
 *     OR the multisig has already signed a proposal to call this).
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/rollback-admin.ts
 */

import { AnchorProvider, Program, setProvider } from "@anchor-lang/core";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import * as anchor from "@anchor-lang/core";
import * as fs from "fs";
import * as path from "path";

const ORIGINAL_ADMIN = new PublicKey("2iVcXi6XXkm1X6w4qLbVvzC1fZ3yS57HxEyn5ghWopak");

const PROTOCOL_SEED = Buffer.from("protocol");
const ORACLE_SEED = Buffer.from("oracle");
const LP_POOL_SEED = Buffer.from("liquidity_pool");

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL || process.env.HELIUS_RPC!;
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");

  const connection = new Connection(rpc, "confirmed");
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const admin = Keypair.fromSecretKey(new Uint8Array(keyData));
  const wallet = new anchor.Wallet(admin);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/pokeliquid.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl as any, provider) as any;

  const [protocolState] = PublicKey.findProgramAddressSync([PROTOCOL_SEED], programId);
  const [oracle] = PublicKey.findProgramAddressSync([ORACLE_SEED], programId);
  const [liquidityPool] = PublicKey.findProgramAddressSync([LP_POOL_SEED], programId);

  const stateBefore = await program.account.protocolState.fetch(protocolState);
  console.log("Current admin:  ", stateBefore.admin.toBase58());
  console.log("Rollback target:", ORIGINAL_ADMIN.toBase58());

  if (stateBefore.admin.toBase58() !== admin.publicKey.toBase58()) {
    console.error("\nERROR: Your keypair is not the current admin!");
    console.error("  Your key:      ", admin.publicKey.toBase58());
    console.error("  On-chain admin:", stateBefore.admin.toBase58());
    process.exit(1);
  }

  if (stateBefore.admin.equals(ORIGINAL_ADMIN)) {
    console.log("\nAdmin is already set to original admin. Nothing to do.");
    return;
  }

  console.log("\nThis will transfer admin back to the original admin keypair.");
  console.log("Press Ctrl+C within 5 seconds to abort...\n");
  await new Promise(r => setTimeout(r, 5000));

  const tx = await program.methods
    .updateParams({
      feeBps: null,
      baseFundingRatePerHour: null,
      skewFactor: null,
      profitCapBps: null,
      maxLongExposure: null,
      maxShortExposure: null,
      minPositionSize: null,
      isPaused: null,
      stalenessThreshold: null,
      secondaryAuthority: null,
      autoPauseThreshold: null,
      insuranceFundBps: null,
      lpFeeBps: null,
      admin: ORIGINAL_ADMIN,
    })
    .accounts({
      admin: admin.publicKey,
      protocolState,
      oracle,
      liquidityPool,
    })
    .signers([admin])
    .rpc();

  console.log("Admin rolled back! tx:", tx);

  const stateAfter = await program.account.protocolState.fetch(protocolState);
  console.log("\nVerification:");
  console.log("  New admin:", stateAfter.admin.toBase58());
  if (stateAfter.admin.equals(ORIGINAL_ADMIN)) {
    console.log("  PASS - admin restored to original");
  } else {
    console.log("  FAIL - admin does NOT match original!");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
