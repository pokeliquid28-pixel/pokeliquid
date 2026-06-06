import * as anchor from "@anchor-lang/core";
import { Program, AnchorProvider, BN } from "@anchor-lang/core";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROTOCOL_SEED = Buffer.from("protocol");
const ORACLE_SEED   = Buffer.from("oracle");
const LP_POOL_SEED  = Buffer.from("liquidity_pool");

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL || "https://api.mainnet-beta.solana.com";
  const keyPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");

  const connection = new Connection(rpc, "confirmed");
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const admin = Keypair.fromSecretKey(new Uint8Array(keyData));
  const wallet = new anchor.Wallet(admin);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/pokeliquid.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl as any, provider) as any;

  const [protocolState] = PublicKey.findProgramAddressSync([PROTOCOL_SEED], programId);
  const [oracle]        = PublicKey.findProgramAddressSync([ORACLE_SEED], programId);
  const [liquidityPool] = PublicKey.findProgramAddressSync([LP_POOL_SEED], programId);

  console.log("Updating fee structure...");
  console.log("  insurance_fund_bps: 1000 → 2500 (25% of trading fees)");
  console.log("  lp_fee_bps: 3000 → 5000 (50% of trading fees)");

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
      insuranceFundBps: new BN(2500),
      lpFeeBps: new BN(5000),
    })
    .accounts({
      admin: admin.publicKey,
      protocolState,
      oracle,
      liquidityPool,
    })
    .signers([admin])
    .rpc();

  console.log("Done! tx:", tx);

  const state = await program.account.protocolState.fetch(protocolState);
  console.log("insurance_fund_bps:", state.insuranceFundBps.toString());

  const pool = await program.account.liquidityPool.fetch(liquidityPool);
  console.log("lp_fee_bps:", pool.lpFeeBps.toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
