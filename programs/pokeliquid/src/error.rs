use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("All position slots are full (max 5)")]
    PositionSlotsFull,
    #[msg("No open position in that slot")]
    NoOpenPosition,
    #[msg("Invalid position index")]
    InvalidPositionIndex,
    #[msg("Leverage must be at least 1")]
    BelowMinLeverage,
    #[msg("Leverage cannot exceed 10")]
    AboveMaxLeverage,
    #[msg("Position size below minimum")]
    BelowMinPositionSize,
    #[msg("Trade would exceed max exposure limit")]
    ExceedsMaxExposure,
    #[msg("Position is not liquidatable")]
    NotLiquidatable,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Oracle price is stale")]
    PriceStale,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Insufficient LP shares")]
    InsufficientShares,
    #[msg("No fees to claim")]
    NoFeesToClaim,
    #[msg("Pool already initialized")]
    PoolAlreadyInitialized,
    #[msg("Insufficient pool balance")]
    InsufficientPoolBalance,
    #[msg("Oracle is not stale — cannot pause")]
    OracleNotStale,
    #[msg("Invalid stop-loss price for position direction")]
    InvalidStopLoss,
    #[msg("Invalid take-profit price for position direction")]
    InvalidTakeProfit,
    #[msg("SL/TP conditions not met")]
    NotTriggered,
    #[msg("Market state oracle does not match the provided oracle account")]
    MarketOracleMismatch,
}
