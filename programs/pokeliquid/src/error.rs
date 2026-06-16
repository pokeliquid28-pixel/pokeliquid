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
    #[msg("Leverage cannot exceed 25")]
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
    #[msg("Oracle price cannot be zero")]
    InvalidOraclePrice,
    #[msg("Oracle price change exceeds maximum deviation")]
    OraclePriceDeviation,
    #[msg("Username too long (max 32 bytes)")]
    UsernameTooLong,
    #[msg("Username cannot be empty")]
    UsernameEmpty,
    #[msg("No referral fees to claim")]
    NoReferralFees,
    #[msg("Fee share must be 0-3000 bps (0-30%)")]
    InvalidFeeShare,
    #[msg("Oracle updates too frequent")]
    OracleUpdateTooFrequent,
    #[msg("Insurance withdrawal exceeds safe reserve")]
    InsuranceReserveViolation,
    #[msg("First LP deposit must be at least 10 USDC")]
    MinFirstDeposit,
    #[msg("Payout queue is full")]
    PayoutQueueFull,
    #[msg("Parameter value out of allowed range")]
    InvalidParam,
}
