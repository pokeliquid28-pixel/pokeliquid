import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@anchor-lang/core";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import IDL from "./idl.json";
import {
  PROGRAM_ID,
  PROTOCOL_STATE,
  FEE_VAULT,
  INSURANCE_FUND,
  USDC_MINT,
  TOKEN_PROGRAM_ID,
  LIQUIDITY_POOL,
  LP_VAULT,
  MARKETS,
  USDC_DECIMALS,
  getMarginPDA,
  getMarketStatePDA,
  getLpPositionPDA,
} from "./constants";
import type { Direction, MarginAccount, Position, LpPosition } from "./types";

// ─── Wallet interface ───────────────────────────────────────────────────────

export type Wallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

// ─── Read-only wallet (for account fetches without signing) ─────────────────

class ReadOnlyWallet implements Wallet {
  readonly publicKey = PublicKey.default;
  async signTransaction<T>(tx: T): Promise<T> {
    throw new Error("Read-only: cannot sign transactions");
  }
  async signAllTransactions<T>(txs: T[]): Promise<T[]> {
    throw new Error("Read-only: cannot sign transactions");
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert USD amount (e.g. 10.5) to raw USDC (10_500_000) */
export function usdToRaw(usd: number): BN {
  return new BN(Math.round(usd * 10 ** USDC_DECIMALS));
}

/** Convert raw USDC (10_500_000) to USD (10.5) */
export function rawToUsd(raw: BN | number): number {
  const n = typeof raw === "number" ? raw : raw.toNumber();
  return n / 10 ** USDC_DECIMALS;
}

function resolveMarket(market: string) {
  const m = MARKETS[market];
  if (!m) {
    throw new Error(
      `Unknown market "${market}". Valid: ${Object.keys(MARKETS).join(", ")}`
    );
  }
  return m;
}

// ─── Client ─────────────────────────────────────────────────────────────────

/**
 * Pokeliquid on-chain trading client.
 *
 * SECURITY: This client only exposes user-level instructions.
 * Admin operations (update_oracle, update_params, withdraw_fees,
 * withdraw_insurance, init_market_oracle, init_market_state) are
 * intentionally excluded.
 */
export class PokeliquidClient {
  readonly connection: Connection;
  readonly program: Program;
  readonly wallet: Wallet;

  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection;
    this.wallet = wallet;
    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    this.program = new Program(IDL as any, provider);
  }

  /** Create a read-only client for fetching account data (no signing). */
  static readonly(connection: Connection): PokeliquidClient {
    return new PokeliquidClient(connection, new ReadOnlyWallet());
  }

  // ── PDA helpers ─────────────────────────────────────────────────────────

  get userKey(): PublicKey {
    return this.wallet.publicKey;
  }

  get marginPDA(): PublicKey {
    return getMarginPDA(this.userKey);
  }

  get lpPositionPDA(): PublicKey {
    return getLpPositionPDA(this.userKey);
  }

  async userATA(): Promise<PublicKey> {
    return getAssociatedTokenAddress(USDC_MINT, this.userKey);
  }

  // ── Account fetching ──────────────────────────────────────────────────

  /** Fetch the user's margin account. Returns null if it doesn't exist. */
  async fetchMarginAccount(): Promise<MarginAccount | null> {
    try {
      return await (this.program.account as any).marginAccount.fetch(
        this.marginPDA
      );
    } catch {
      return null;
    }
  }

  /** Fetch the user's LP position. Returns null if it doesn't exist. */
  async fetchLpPosition(): Promise<LpPosition | null> {
    try {
      return await (this.program.account as any).lpPosition.fetch(
        this.lpPositionPDA
      );
    } catch {
      return null;
    }
  }

  /** Get the user's USDC balance (in human-readable USD). */
  async usdcBalance(): Promise<number> {
    const ata = await this.userATA();
    try {
      const info = await this.connection.getTokenAccountBalance(ata);
      return Number(info.value.uiAmount ?? 0);
    } catch {
      return 0;
    }
  }

  /** Get the user's SOL balance. */
  async solBalance(): Promise<number> {
    const bal = await this.connection.getBalance(this.userKey);
    return bal / 1e9;
  }

  // ── Collateral ────────────────────────────────────────────────────────

  /**
   * Deposit USDC into your margin account.
   * Creates the margin account automatically if it doesn't exist.
   * @param amountUsd - Amount in USD (e.g. 10.50)
   * @returns Transaction signature
   */
  async deposit(amountUsd: number): Promise<string> {
    const ata = await this.userATA();
    return this.program.methods
      .depositCollateral(usdToRaw(amountUsd))
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: this.marginPDA,
        userTokenAccount: ata,
        feeVault: FEE_VAULT,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Withdraw USDC from your margin account.
   * @param amountUsd - Amount in USD
   * @returns Transaction signature
   */
  async withdraw(amountUsd: number): Promise<string> {
    const ata = await this.userATA();
    return this.program.methods
      .withdrawCollateral(usdToRaw(amountUsd))
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: this.marginPDA,
        userTokenAccount: ata,
        feeVault: FEE_VAULT,
        liquidityPool: LIQUIDITY_POOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  // ── Trading ───────────────────────────────────────────────────────────

  /**
   * Open a leveraged position.
   * @param market - Market key: "ETB", "CHARIZARD-X", "CHARMANDER", "PIKACHU"
   * @param direction - { long: {} } or { short: {} }. Use Long/Short exports.
   * @param collateralUsd - Collateral in USD (e.g. 10.00)
   * @param leverage - 1-10
   * @param opts.slPrice - Optional stop-loss price in USD
   * @param opts.tpPrice - Optional take-profit price in USD
   * @returns Transaction signature
   */
  async openPosition(
    market: string,
    direction: Direction,
    collateralUsd: number,
    leverage: number,
    opts?: { slPrice?: number; tpPrice?: number }
  ): Promise<string> {
    const m = resolveMarket(market);
    const marketStatePDA = getMarketStatePDA(m.id);
    const slRaw = opts?.slPrice ? usdToRaw(opts.slPrice) : null;
    const tpRaw = opts?.tpPrice ? usdToRaw(opts.tpPrice) : null;

    return this.program.methods
      .openPosition(
        direction,
        usdToRaw(collateralUsd),
        leverage,
        slRaw,
        tpRaw
      )
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: this.marginPDA,
        oracle: m.oracle,
        marketState: marketStatePDA,
        feeVault: FEE_VAULT,
        insuranceFund: INSURANCE_FUND,
        liquidityPool: LIQUIDITY_POOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Close a position.
   * @param market - Market key
   * @param positionIndex - Position slot index (0-4)
   * @returns Transaction signature
   */
  async closePosition(market: string, positionIndex: number): Promise<string> {
    const m = resolveMarket(market);
    const marketStatePDA = getMarketStatePDA(m.id);
    const ata = await this.userATA();

    return this.program.methods
      .closePosition(positionIndex)
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: this.marginPDA,
        oracle: m.oracle,
        marketState: marketStatePDA,
        feeVault: FEE_VAULT,
        insuranceFund: INSURANCE_FUND,
        userTokenAccount: ata,
        liquidityPool: LIQUIDITY_POOL,
        lpVault: LP_VAULT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Set stop-loss and/or take-profit on a position.
   * Pass null to clear.
   * @param market - Market key
   * @param positionIndex - Position slot index (0-4)
   * @param slPrice - Stop-loss price in USD, or null to clear
   * @param tpPrice - Take-profit price in USD, or null to clear
   */
  async setSlTp(
    market: string,
    positionIndex: number,
    slPrice: number | null,
    tpPrice: number | null
  ): Promise<string> {
    const m = resolveMarket(market);
    return this.program.methods
      .setSlTp(
        positionIndex,
        slPrice !== null ? usdToRaw(slPrice) : null,
        tpPrice !== null ? usdToRaw(tpPrice) : null
      )
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: this.marginPDA,
        oracle: m.oracle,
      })
      .rpc();
  }

  /**
   * Add margin to an open position (lowers liquidation price).
   * @param positionIndex - Position slot index (0-4)
   * @param amountUsd - Amount to add in USD
   */
  async addMargin(positionIndex: number, amountUsd: number): Promise<string> {
    return this.program.methods
      .addMargin(positionIndex, usdToRaw(amountUsd))
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: this.marginPDA,
      })
      .rpc();
  }

  /**
   * Remove margin from an open position (health-checked).
   * @param market - Market key (needed for oracle price check)
   * @param positionIndex - Position slot index (0-4)
   * @param amountUsd - Amount to remove in USD
   */
  async removeMargin(
    market: string,
    positionIndex: number,
    amountUsd: number
  ): Promise<string> {
    const m = resolveMarket(market);
    return this.program.methods
      .removeMargin(positionIndex, usdToRaw(amountUsd))
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: this.marginPDA,
        oracle: m.oracle,
      })
      .rpc();
  }

  /**
   * Close your margin account and reclaim rent.
   * Account must have zero collateral and no open positions.
   */
  async closeMarginAccount(): Promise<string> {
    return this.program.methods
      .closeMarginAccount()
      .accounts({
        user: this.userKey,
        marginAccount: this.marginPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ── Liquidity Pool ────────────────────────────────────────────────────

  /**
   * Deposit USDC into the LP pool for shares.
   * @param amountUsd - Amount in USD
   * @returns Transaction signature
   */
  async lpDeposit(amountUsd: number): Promise<string> {
    const ata = await this.userATA();
    return this.program.methods
      .lpDeposit(usdToRaw(amountUsd))
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        liquidityPool: LIQUIDITY_POOL,
        lpPosition: this.lpPositionPDA,
        userTokenAccount: ata,
        lpVault: LP_VAULT,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Withdraw from the LP pool by burning shares.
   * @param shares - Number of shares to burn (raw BN)
   * @returns Transaction signature
   */
  async lpWithdraw(shares: BN): Promise<string> {
    const ata = await this.userATA();
    return this.program.methods
      .lpWithdraw(shares)
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        liquidityPool: LIQUIDITY_POOL,
        lpPosition: this.lpPositionPDA,
        userTokenAccount: ata,
        lpVault: LP_VAULT,
        feeVault: FEE_VAULT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Claim accumulated LP fees.
   * @returns Transaction signature
   */
  async claimFees(): Promise<string> {
    const ata = await this.userATA();
    return this.program.methods
      .claimFees()
      .accounts({
        user: this.userKey,
        protocolState: PROTOCOL_STATE,
        liquidityPool: LIQUIDITY_POOL,
        lpPosition: this.lpPositionPDA,
        userTokenAccount: ata,
        feeVault: FEE_VAULT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }
}
