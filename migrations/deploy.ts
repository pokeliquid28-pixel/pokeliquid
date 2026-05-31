/**
 * deploy.ts — pokeliquid devnet deploy + initialize script
 *
 * Run: anchor migrate --provider.cluster devnet
 */
import * as anchor from "@anchor-lang/core";
import { Program, BN } from "@anchor-lang/core";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROTOCOL_SEED       = Buffer.from("protocol");
const ORACLE_SEED         = Buffer.from("oracle");
const USDC_MINT_SEED      = Buffer.from("usdc_mint");
const FEE_VAULT_SEED      = Buffer.from("fee_vault");
const INSURANCE_FUND_SEED = Buffer.from("insurance_fund");

module.exports = async function (provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);

  const idl = require("../target/idl/pokeliquid.json");
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as any;

  const admin = (provider.wallet as anchor.Wallet).payer;

  const [protocolState] = PublicKey.findProgramAddressSync([PROTOCOL_SEED], programId);
  const [oracle]        = PublicKey.findProgramAddressSync([ORACLE_SEED],   programId);
  const [usdcMint]      = PublicKey.findProgramAddressSync([USDC_MINT_SEED], programId);
  const [feeVault]      = PublicKey.findProgramAddressSync([FEE_VAULT_SEED], programId);
  const [insuranceFund] = PublicKey.findProgramAddressSync([INSURANCE_FUND_SEED], programId);

  console.log("\n═══════════════════════════════════════════");
  console.log("  pokeliquid — CHARIZARD-PERP Deploy");
  console.log("═══════════════════════════════════════════");
  console.log("Program ID:     ", programId.toBase58());
  console.log("Admin:          ", admin.publicKey.toBase58());
  console.log("ProtocolState:  ", protocolState.toBase58());
  console.log("Oracle:         ", oracle.toBase58());
  console.log("USDC Mint:      ", usdcMint.toBase58());
  console.log("FeeVault:       ", feeVault.toBase58());
  console.log("InsuranceFund:  ", insuranceFund.toBase58());

  // Check if already initialized
  try {
    await program.account.protocolState.fetch(protocolState);
    console.log("\n✓ Protocol already initialized — skipping.");
    return;
  } catch (_) { /* not yet initialized */ }

  console.log("\nInitializing...");
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

  // Set initial CHARIZARD-PERP price ($25.00)
  console.log("Setting initial oracle price ($25.00)...");
  const priceTx = await program.methods
    .updateOracle(new BN(25_000_000))
    .accounts({ admin: admin.publicKey, protocolState, oracle })
    .signers([admin])
    .rpc();
  console.log("✓ Oracle price set. tx:", priceTx);

  console.log("\n═══════════════════════════════════════════");
  console.log("  Deploy complete!");
  console.log("═══════════════════════════════════════════");
};
