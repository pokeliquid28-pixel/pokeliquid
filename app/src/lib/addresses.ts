import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ"
);

export const PROTOCOL_STATE = new PublicKey(
  process.env.NEXT_PUBLIC_PROTOCOL_STATE ?? "8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK"
);

export const ORACLE_ACCOUNT = new PublicKey(
  process.env.NEXT_PUBLIC_ORACLE_ACCOUNT ?? "4v5ogQV1i2yQhdsc4YuG78AG5NvtDaE9kfCSCQwL3bZH"
);

export const FEE_VAULT = new PublicKey(
  process.env.NEXT_PUBLIC_FEE_VAULT ?? "GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581"
);

export const INSURANCE_FUND = new PublicKey(
  process.env.NEXT_PUBLIC_INSURANCE_FUND ?? "9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F"
);

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi"
);

// PDA seeds (mirror constants.rs)
export const PROTOCOL_SEED = Buffer.from("protocol");
export const ORACLE_SEED = Buffer.from("oracle");
export const MARGIN_SEED = Buffer.from("margin");
export const FEE_VAULT_SEED = Buffer.from("fee_vault");
export const INSURANCE_FUND_SEED = Buffer.from("insurance_fund");
export const USDC_MINT_SEED = Buffer.from("usdc_mint");
export const MARKET_SEED = Buffer.from("market");
export const LP_SEED = Buffer.from("lp");
export const LP_POOL_SEED = Buffer.from("liquidity_pool");
export const LP_VAULT_SEED = Buffer.from("lp_vault");

export function getMarginAccountPDA(userPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARGIN_SEED, userPubkey.toBuffer()],
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

export function getLpPositionPDA(userPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [LP_SEED, userPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export const LIQUIDITY_POOL = getLiquidityPoolPDA();
export const LP_VAULT = getLpVaultPDA();
