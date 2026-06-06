import { PublicKey } from "@solana/web3.js";

// ─── Program & accounts ────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey(
  "5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6"
);

export const PROTOCOL_STATE = new PublicKey(
  "6yAYSsp863889v7bhMEwj6tVq5DvFTi1gwzwHFrqwLFL"
);

export const FEE_VAULT = new PublicKey(
  "BFm4z6Z2H84GrpcKkydmE1qZVidwuj2sP3N3wTNZemJt"
);

export const INSURANCE_FUND = new PublicKey(
  "266CZZpRb1PFDGQf4bNE5ASPVxAUkon6tv6BvRYpP7x9"
);

export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

// ─── PDA seeds ──────────────────────────────────────────────────────────────

export const MARGIN_SEED = Buffer.from("margin");
export const MARKET_SEED = Buffer.from("market");
export const LP_SEED = Buffer.from("lp");
export const LP_POOL_SEED = Buffer.from("liquidity_pool");
export const LP_VAULT_SEED = Buffer.from("lp_vault");

// ─── PDA derivation ─────────────────────────────────────────────────────────

export function getMarginPDA(user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARGIN_SEED, user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getMarketStatePDA(marketId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED, Buffer.from(marketId)],
    PROGRAM_ID
  );
  return pda;
}

export function getLiquidityPoolPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [LP_POOL_SEED],
    PROGRAM_ID
  );
  return pda;
}

export function getLpVaultPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [LP_VAULT_SEED],
    PROGRAM_ID
  );
  return pda;
}

export function getLpPositionPDA(user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [LP_SEED, user.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// Pre-computed shared PDAs
export const LIQUIDITY_POOL = getLiquidityPoolPDA();
export const LP_VAULT = getLpVaultPDA();

// ─── Markets ────────────────────────────────────────────────────────────────

export type MarketConfig = {
  /** On-chain market ID used in PDA seeds */
  id: string;
  /** Display name */
  name: string;
  /** Oracle account public key */
  oracle: PublicKey;
  /** API query param for the keeper */
  apiId: string;
};

export const MARKETS: Record<string, MarketConfig> = {
  ETB: {
    id: "PRISMATIC-ETB",
    name: "PRISMATIC-ETB-PERP",
    oracle: new PublicKey("FbPBfXaCY1Chm23pyVv7gcesRVK7FxFXHgd5xNb84r4Q"),
    apiId: "ETB",
  },
  "CHARIZARD-X": {
    id: "CHARIZARD-125/094-PFL",
    name: "CHARIZARD-125/094-PFL-PERP",
    oracle: new PublicKey("8KU9oyrCAhX58Mz73z8MjKH8P88CyqPcx8zCm61HWzeP"),
    apiId: "CHARIZARD-X",
  },
  CHARMANDER: {
    id: "CHARMANDER-038-MEP",
    name: "CHARMANDER-038-MEP-PERP",
    oracle: new PublicKey("EN3Y7vWu2a2PXma2V5vfm6swFed8YTFHCG75EQxoHETY"),
    apiId: "CHARMANDER",
  },
  PIKACHU: {
    id: "PIKACHU-276/217-AH",
    name: "PIKACHU-276/217-AH-PERP",
    oracle: new PublicKey("Fx1rYyuEz91rqgpEWHs8MyH7kiLpNeXuDdcAJiSjhN87"),
    apiId: "PIKACHU",
  },
};

// ─── Scale ──────────────────────────────────────────────────────────────────

/** USDC has 6 decimals. Raw amounts are scaled by 1e6. */
export const USDC_DECIMALS = 6;
export const PRICE_SCALE = 1_000_000;
