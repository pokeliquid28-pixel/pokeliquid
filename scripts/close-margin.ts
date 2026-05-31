import * as anchor from "@anchor-lang/core";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const MARGIN_SEED = Buffer.from("margin");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey("7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ");
  const idl = require("../target/idl/pokeliquid.json");
  const program = new anchor.Program(idl, provider);

  const user = provider.wallet.publicKey;
  const [marginPda] = PublicKey.findProgramAddressSync(
    [MARGIN_SEED, user.toBuffer()],
    programId
  );

  console.log("User:", user.toBase58());
  console.log("Margin PDA:", marginPda.toBase58());

  // Check if account exists
  const info = await provider.connection.getAccountInfo(marginPda);
  if (!info) {
    console.log("No margin account found — nothing to close.");
    return;
  }
  console.log(`Found margin account: ${info.data.length} bytes, ${info.lamports} lamports`);

  const tx = await (program.methods as any)
    .closeMarginAccount()
    .accounts({
      user,
      marginAccount: marginPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Margin account closed! tx:", tx);
  console.log("You can now deposit collateral to create a fresh multi-position account.");
}

main().catch(console.error);
