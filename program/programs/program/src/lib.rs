use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("EJeBowVHBopARqR3qCNXN7a2iJeM2Zf5c6gd2ZH8Lrs9");

#[program]
pub mod keymint_payment {
    use super::*;

    /// Initialize a publisher account
    pub fn initialize_publisher(ctx: Context<InitializePublisher>) -> Result<()> {
        let publisher = &mut ctx.accounts.publisher_account;
        publisher.authority = ctx.accounts.authority.key();
        publisher.total_earned = 0;
        publisher.total_requests = 0;
        publisher.bump = ctx.bumps.publisher_account;
        msg!("Publisher account initialized: {}", publisher.authority);
        Ok(())
    }

    /// Verify payment and transfer USDC
    pub fn verify_and_pay(
        ctx: Context<VerifyAndPay>,
        amount: u64,
        endpoint: String,
        timestamp: i64,
    ) -> Result<()> {
        require!(amount > 0, KeymintError::InvalidAmount);
        require!(endpoint.len() <= 128, KeymintError::EndpointTooLong);

        // Validate timestamp is within reasonable range (+-30 seconds)
        let clock = Clock::get()?;
        let diff = (clock.unix_timestamp - timestamp).abs();
        require!(diff <= 30, KeymintError::TimestampOutOfRange);

        // Transfer USDC: payer -> publisher
        let transfer_accounts = Transfer {
            from: ctx.accounts.payer_token_account.to_account_info(),
            to: ctx.accounts.publisher_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        );
        token::transfer(cpi_ctx, amount)?;

        // Update publisher stats
        let publisher = &mut ctx.accounts.publisher_account;
        publisher.total_earned = publisher
            .total_earned
            .checked_add(amount)
            .ok_or(KeymintError::Overflow)?;
        publisher.total_requests = publisher
            .total_requests
            .checked_add(1)
            .ok_or(KeymintError::Overflow)?;

        // Write audit log
        let audit = &mut ctx.accounts.audit_log;
        audit.payer = ctx.accounts.payer.key();
        audit.publisher = publisher.authority;
        audit.amount = amount;
        audit.endpoint = endpoint.clone();
        audit.timestamp = timestamp;
        audit.bump = ctx.bumps.audit_log;

        emit!(PaymentEvent {
            payer: ctx.accounts.payer.key(),
            publisher: publisher.authority,
            amount,
            endpoint,
            timestamp,
        });

        msg!(
            "Payment verified: {} lamports, endpoint: {}",
            amount,
            audit.endpoint
        );
        Ok(())
    }
}

// -- Account structs --

#[derive(Accounts)]
pub struct InitializePublisher<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PublisherAccount::INIT_SPACE,
        seeds = [b"publisher", authority.key().as_ref()],
        bump
    )]
    pub publisher_account: Account<'info, PublisherAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, endpoint: String, timestamp: i64)]
pub struct VerifyAndPay<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Publisher PDA account
    #[account(
        mut,
        seeds = [b"publisher", publisher_account.authority.as_ref()],
        bump = publisher_account.bump
    )]
    pub publisher_account: Account<'info, PublisherAccount>,

    /// Payer USDC token account
    #[account(mut)]
    pub payer_token_account: Account<'info, TokenAccount>,

    /// Publisher USDC token account
    #[account(mut)]
    pub publisher_token_account: Account<'info, TokenAccount>,

    /// Audit log PDA — unique per payment
    #[account(
        init,
        payer = payer,
        space = 8 + AuditLog::INIT_SPACE,
        seeds = [
            b"audit",
            payer.key().as_ref(),
            &timestamp.to_le_bytes()
        ],
        bump
    )]
    pub audit_log: Account<'info, AuditLog>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// -- Data structs --

#[account]
#[derive(InitSpace)]
pub struct PublisherAccount {
    pub authority: Pubkey,    // 32
    pub total_earned: u64,    // 8
    pub total_requests: u64,  // 8
    pub bump: u8,             // 1
}

#[account]
#[derive(InitSpace)]
pub struct AuditLog {
    pub payer: Pubkey,        // 32
    pub publisher: Pubkey,    // 32
    pub amount: u64,          // 8
    #[max_len(128)]
    pub endpoint: String,     // 4 + 128
    pub timestamp: i64,       // 8
    pub bump: u8,             // 1
}

// -- Events --

#[event]
pub struct PaymentEvent {
    pub payer: Pubkey,
    pub publisher: Pubkey,
    pub amount: u64,
    pub endpoint: String,
    pub timestamp: i64,
}

// -- Errors --

#[error_code]
pub enum KeymintError {
    #[msg("Invalid payment amount")]
    InvalidAmount,
    #[msg("Endpoint too long (max 128 chars)")]
    EndpointTooLong,
    #[msg("Token account owner mismatch")]
    InvalidTokenOwner,
    #[msg("Token mint mismatch")]
    MintMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Timestamp out of range (+-30 seconds)")]
    TimestampOutOfRange,
}
