import * as anchor from "@anchor-lang/core";
import { Program, AnchorProvider, BN } from "@anchor-lang/core";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROTOCOL_SEED = Buffer.from("protocol");
const ORACLE_SEED   = Buffer.from("oracle");

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
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

  const secondaryKeyPath = path.join(__dirname, "../keeper/secondary.json");
  const secondaryData = JSON.parse(fs.readFileSync(secondaryKeyPath, "utf8"));
  const secondaryKeypair = Keypair.fromSecretKey(new Uint8Array(secondaryData));

  console.log("Setting secondary authority to:", secondaryKeypair.publicKey.toBase58());

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
      secondaryAuthority: secondaryKeypair.publicKey,
      autoPauseThreshold: new BN(3600),
    })
    .accounts({
      admin: admin.publicKey,
      protocolState,
      oracle,
    })
    .signers([admin])
    .rpc();

  console.log("Done! tx:", tx);

  const state = await program.account.protocolState.fetch(protocolState);
  console.log("secondary_authority:", state.secondaryAuthority.toBase58());
  console.log("auto_pause_threshold:", state.autoPauseThreshold.toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
