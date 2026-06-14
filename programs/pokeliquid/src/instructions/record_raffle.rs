use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{ProtocolState, RaffleResult},
};

#[derive(Accounts)]
#[instruction(round: u32)]
pub struct RecordRaffle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = (protocol_state.admin == authority.key()
            || protocol_state.secondary_authority == authority.key())
            @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer = authority,
        space = RaffleResult::SPACE,
        seeds = [RAFFLE_SEED, &round.to_le_bytes()],
        bump,
    )]
    pub raffle_result: Account<'info, RaffleResult>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RecordRaffle>,
    round: u32,
    winner: Pubkey,
    total_entries: u64,
    total_holders: u32,
    winner_tickets: u64,
    slot_hash_seed: [u8; 32],
    prize_description: [u8; 64],
) -> Result<()> {
    let raffle = &mut ctx.accounts.raffle_result;
    raffle.round = round;
    raffle.winner = winner;
    raffle.total_entries = total_entries;
    raffle.total_holders = total_holders;
    raffle.winner_tickets = winner_tickets;
    raffle.slot_hash_seed = slot_hash_seed;
    raffle.prize_description = prize_description;
    raffle.timestamp = Clock::get()?.unix_timestamp;
    raffle.bump = ctx.bumps.raffle_result;

    msg!("Raffle #{} winner: {} ({} tickets / {} total)", round, winner, winner_tickets, total_entries);
    Ok(())
}
