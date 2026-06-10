import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6"
);

export const PROTOCOL_STATE = new PublicKey(
  process.env.NEXT_PUBLIC_PROTOCOL_STATE ?? "6yAYSsp863889v7bhMEwj6tVq5DvFTi1gwzwHFrqwLFL"
);

export const ORACLE_ACCOUNT = new PublicKey(
  process.env.NEXT_PUBLIC_ORACLE_ACCOUNT ?? "ANrbuXt3ui1KMEDfnRrhT72Zi8v3NSrVgCwvcdwurTCp"
);

export const FEE_VAULT = new PublicKey(
  process.env.NEXT_PUBLIC_FEE_VAULT ?? "BFm4z6Z2H84GrpcKkydmE1qZVidwuj2sP3N3wTNZemJt"
);

export const INSURANCE_FUND = new PublicKey(
  process.env.NEXT_PUBLIC_INSURANCE_FUND ?? "266CZZpRb1PFDGQf4bNE5ASPVxAUkon6tv6BvRYpP7x9"
);

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
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

export const REFERRAL_SEED = Buffer.from("referral");

export function getReferralAccountPDA(userPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [REFERRAL_SEED, userPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export const LIQUIDITY_POOL = getLiquidityPoolPDA();
export const LP_VAULT = getLpVaultPDA();
