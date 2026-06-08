/**
 * Test that update_params works after the program upgrade.
 * Sends a no-op update (all nulls + admin: null) to verify deserialization.
 */

import { AnchorProvider, Program, setProvider } from "@anchor-lang/core";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import * as anchor from "@anchor-lang/core";
import * as fs from "fs";
import * as path from "path";

const HELIUS_RPC = process.env.HELIUS_RPC!;
const PROTOCOL_SEED = Buffer.from("protocol");
const ORACLE_SEED = Buffer.from("oracle");
const LP_POOL_SEED = Buffer.from("liquidity_pool");

async function main() {
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const connection = new Connection(HELIUS_RPC, "confirmed");
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

  // Read state before
  const stateBefore = await program.account.protocolState.fetch(protocolState);
  console.log("Current admin:", stateBefore.admin.toBase58());
  console.log("Current fee_bps:", stateBefore.feeBps.toString());
  console.log("Current is_paused:", stateBefore.isPaused);

  // Send no-op update_params (all nulls including new admin field)
  console.log("\nSending no-op update_params...");
  try {
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
        admin: null,
      })
      .accounts({
        admin: admin.publicKey,
        protocolState,
        oracle,
        liquidityPool,
      })
      .signers([admin])
      .rpc();

    console.log("✅ update_params succeeded! tx:", tx);
  } catch (e: any) {
    console.error("❌ update_params FAILED:", e.message);
    process.exit(1);
  }

  // Verify state unchanged
  const stateAfter = await program.account.protocolState.fetch(protocolState);
  console.log("\nVerification (should match before):");
  console.log("  admin:", stateAfter.admin.toBase58());
  console.log("  fee_bps:", stateAfter.feeBps.toString());
  console.log("  is_paused:", stateAfter.isPaused);

  if (
    stateAfter.admin.equals(stateBefore.admin) &&
    stateAfter.feeBps.eq(stateBefore.feeBps) &&
    stateAfter.isPaused === stateBefore.isPaused
  ) {
    console.log("\n✅ ALL GOOD — update_params works correctly after upgrade");
  } else {
    console.error("\n❌ STATE CHANGED — something went wrong!");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
