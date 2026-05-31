import * as anchor from "@anchor-lang/core";
import { Program, BN, AnchorProvider } from "@anchor-lang/core";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROTOCOL_SEED       = Buffer.from("protocol");
const ORACLE_SEED         = Buffer.from("oracle");
const USDC_MINT_SEED      = Buffer.from("usdc_mint");
const FEE_VAULT_SEED      = Buffer.from("fee_vault");
const INSURANCE_FUND_SEED = Buffer.from("insurance_fund");

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
  const [oracle]        = PublicKey.findProgramAddressSync([ORACLE_SEED],   programId);
  const [usdcMint]      = PublicKey.findProgramAddressSync([USDC_MINT_SEED], programId);
  const [feeVault]      = PublicKey.findProgramAddressSync([FEE_VAULT_SEED], programId);
  const [insuranceFund] = PublicKey.findProgramAddressSync([INSURANCE_FUND_SEED], programId);

  console.log("\n═══════════════════════════════════════════");
  console.log("  pokeliquid — CHARIZARD-PERP");
  console.log("═══════════════════════════════════════════");
  console.log("Program ID:     ", programId.toBase58());
  console.log("Admin:          ", admin.publicKey.toBase58());
  console.log("ProtocolState:  ", protocolState.toBase58());
  console.log("Oracle:         ", oracle.toBase58());
  console.log("USDC Mint:      ", usdcMint.toBase58());
  console.log("FeeVault:       ", feeVault.toBase58());
  console.log("InsuranceFund:  ", insuranceFund.toBase58());
  console.log("═══════════════════════════════════════════\n");

  let alreadyInit = false;
  try {
    await program.account.protocolState.fetch(protocolState);
    alreadyInit = true;
  } catch (_) {}

  if (alreadyInit) {
    console.log("✓ Protocol already initialized.");
    return;
  }

  console.log("Initializing protocol...");
  const tx = await program.methods
    .initialize()
    .accounts({
      admin: admin.publicKey,
      protocolState,
      oracle,
      usdcMint,
      feeVault,
      insuranceFund,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([admin])
    .rpc();
  console.log("✓ Initialized! tx:", tx);

  console.log("Setting oracle price ($25.00)...");
  const priceTx = await program.methods
    .updateOracle(new BN(25_000_000))
    .accounts({ admin: admin.publicKey, protocolState, oracle })
    .signers([admin])
    .rpc();
  console.log("✓ Oracle price set to $25.00. tx:", priceTx);
  console.log("\n✓ Setup complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
