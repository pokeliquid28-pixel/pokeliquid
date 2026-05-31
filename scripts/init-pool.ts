import * as anchor from "@anchor-lang/core";
import { Program, AnchorProvider } from "@anchor-lang/core";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROTOCOL_SEED   = Buffer.from("protocol");
const USDC_MINT_SEED  = Buffer.from("usdc_mint");
const LP_POOL_SEED    = Buffer.from("liquidity_pool");
const LP_VAULT_SEED   = Buffer.from("lp_vault");

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
  const [usdcMint]      = PublicKey.findProgramAddressSync([USDC_MINT_SEED], programId);
  const [liquidityPool] = PublicKey.findProgramAddressSync([LP_POOL_SEED], programId);
  const [lpVault]       = PublicKey.findProgramAddressSync([LP_VAULT_SEED], programId);

  console.log("\n═══════════════════════════════════════════");
  console.log("  pokeliquid — Initialize Liquidity Pool");
  console.log("═══════════════════════════════════════════");
  console.log("Program ID:     ", programId.toBase58());
  console.log("Admin:          ", admin.publicKey.toBase58());
  console.log("LiquidityPool:  ", liquidityPool.toBase58());
  console.log("LP Vault:       ", lpVault.toBase58());
  console.log("═══════════════════════════════════════════\n");

  // Check if already initialized
  try {
    await program.account.liquidityPool.fetch(liquidityPool);
    console.log("✓ Liquidity pool already initialized.");
    return;
  } catch (_) {}

  console.log("Initializing liquidity pool...");
  const tx = await program.methods
    .initializePool()
    .accounts({
      admin: admin.publicKey,
      protocolState,
      usdcMint,
      liquidityPool,
      lpVault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([admin])
    .rpc();

  console.log("✓ Liquidity pool initialized! tx:", tx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
