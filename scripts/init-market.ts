import { Program, BN, AnchorProvider } from "@anchor-lang/core";
import * as anchor from "@anchor-lang/core";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const ORACLE_SEED = Buffer.from("oracle");
const PROTOCOL_SEED = Buffer.from("protocol");

interface MarketConfig {
  marketId: string;
  seedPrice: number; // USD
}

const MARKETS: MarketConfig[] = [
  { marketId: "CHARIZARD-X", seedPrice: 884 },
  { marketId: "CHARMANDER", seedPrice: 20 },
  { marketId: "PIKACHU", seedPrice: 150 },
];

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

  console.log("\n═══════════════════════════════════════════");
  console.log("  pokeliquid — Initialize Market Oracles");
  console.log("═══════════════════════════════════════════");
  console.log("Program ID:     ", programId.toBase58());
  console.log("Admin:          ", admin.publicKey.toBase58());
  console.log("ProtocolState:  ", protocolState.toBase58());
  console.log("");

  // Filter to specific market if passed as CLI arg
  const targetMarket = process.argv[2];
  const marketsToInit = targetMarket
    ? MARKETS.filter((m) => m.marketId === targetMarket)
    : MARKETS;

  if (marketsToInit.length === 0) {
    console.log(`Market "${targetMarket}" not found. Available: ${MARKETS.map((m) => m.marketId).join(", ")}`);
    process.exit(1);
  }

  for (const market of marketsToInit) {
    const [oraclePda] = PublicKey.findProgramAddressSync(
      [ORACLE_SEED, Buffer.from(market.marketId)],
      programId
    );

    console.log(`\n── ${market.marketId} ──`);
    console.log(`  Oracle PDA: ${oraclePda.toBase58()}`);

    // Check if already initialized
    let alreadyInit = false;
    try {
      await program.account.oracleAccount.fetch(oraclePda);
      alreadyInit = true;
    } catch (_) {}

    if (alreadyInit) {
      console.log(`  Already initialized — skipping init`);
    } else {
      console.log(`  Initializing oracle...`);
      const initTx = await program.methods
        .initMarketOracle(market.marketId)
        .accounts({
          admin: admin.publicKey,
          protocolState,
          oracle: oraclePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      console.log(`  Init tx: ${initTx}`);
    }

    // Set seed price
    const seedPriceRaw = new BN(Math.round(market.seedPrice * 1_000_000));
    console.log(`  Setting seed price: $${market.seedPrice} (raw: ${seedPriceRaw.toString()})...`);
    const priceTx = await program.methods
      .updateMarketOracle(market.marketId, seedPriceRaw)
      .accounts({
        authority: admin.publicKey,
        protocolState,
        oracle: oraclePda,
      })
      .signers([admin])
      .rpc();
    console.log(`  Price tx: ${priceTx}`);

    console.log(`  ✓ ${market.marketId} oracle ready at ${oraclePda.toBase58()}`);
  }

  console.log("\n═══════════════════════════════════════════");
  console.log("  Add these to your keeper .env:");
  console.log("═══════════════════════════════════════════");
  for (const market of marketsToInit) {
    const [oraclePda] = PublicKey.findProgramAddressSync(
      [ORACLE_SEED, Buffer.from(market.marketId)],
      programId
    );
    const envKey = `ORACLE_${market.marketId.replace(/-/g, "_")}`;
    console.log(`${envKey}=${oraclePda.toBase58()}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
