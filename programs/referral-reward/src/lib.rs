use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use anchor_spl::token::{self, Transfer};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("AXXdpEe4mjbwbZUnNpT3X3QH8Bqo65WEqXJqZsSdeffr");

// Referral distribution percentages: Level 1 gets 70%, Level 2 gets 30%
const L1_PERCENT: u64 = 70;
const L2_PERCENT: u64 = 30;

#[program]
pub mod referral_reward {
    use super::*;

    /// Initializes the global configuration and the secure token vault.
    /// This sets the admin authority, the reward token mint, and stores PDA bumps.
    pub fn initialize(ctx: Context<Initialize>, reward_amount: u64) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        state.admin = ctx.accounts.admin.key();
        state.mint = ctx.accounts.mint.key();
        state.reward_amount = reward_amount;
        state.total_distributed = 0;
        state.total_users = 0;
        state.state_bump = ctx.bumps.global_state;
        state.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    /// Creates a new on-chain user profile (UserAccount PDA).
    /// Stores user metadata and links the user to an optional referrer.
    pub fn register_user(ctx: Context<RegisterUser>, name: String, referrer: Option<Pubkey>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let state = &mut ctx.accounts.global_state;

        // Ensure the name doesn't exceed the allocated space (32 bytes)
        require!(name.len() <= 32, ErrorCode::NameTooLong);
        // Prevent re-initialization of an existing user PDA
        require!(!user_account.initialized, ErrorCode::AlreadyRegistered);

        user_account.wallet = ctx.accounts.user.key();
        user_account.name = name.clone();
        // If no referrer is provided, defaults to a null/system address
        user_account.referrer = referrer.unwrap_or(Pubkey::default());
        user_account.pending_rewards = 0;
        user_account.total_earned = 0;
        user_account.total_referrals = 0;
        user_account.joined_at = Clock::get()?.unix_timestamp;
        user_account.initialized = true;

        state.total_users += 1;

        emit!(UserRegistered {
            user: ctx.accounts.user.key(),
            name: name,
        });

        Ok(())
    }

    /// Admin-only function to record a completed action and calculate rewards.
    /// Distributes 70% of reward_amount to Level 1 and 30% to Level 2 (if exists).
    pub fn complete_action(ctx: Context<CompleteAction>) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        // Access control: Only the designated admin can trigger reward calculations
        require!(ctx.accounts.authority.key() == state.admin, ErrorCode::Unauthorized);

        let total = state.reward_amount;
        let l1_amount = total.checked_mul(L1_PERCENT).unwrap() / 100;
        let l2_amount = total.checked_mul(L2_PERCENT).unwrap() / 100;

        let l1 = &mut ctx.accounts.l1_account;
        l1.pending_rewards += l1_amount;
        l1.total_earned += l1_amount;
        l1.total_referrals += 1;

        let mut distributed = l1_amount;

        // Indirect Referral Logic: If L1 user has a referrer, they receive the L2 reward
        if l1.referrer != Pubkey::default() {
            let l2 = &mut ctx.accounts.l2_account;
            l2.pending_rewards += l2_amount;
            l2.total_earned += l2_amount;
            distributed += l2_amount;
        }

        state.total_distributed += distributed;

        emit!(ActionCompleted {
            l1_user: l1.wallet,
            total_distributed: distributed,
        });

        Ok(())
    }

    /// Allows a user to transfer their accumulated pending_rewards from the Vault to their wallet.
    /// Uses a CPI (Cross-Program Invocation) with the Vault PDA as the signer.
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let state = &ctx.accounts.global_state;
        let user_account = &mut ctx.accounts.user_account;
        let amount = user_account.pending_rewards;

        require!(amount > 0, ErrorCode::NothingToClaim);
        
        let vault_bump = state.vault_bump;
        let seeds = &[
            b"vault".as_ref(),
            &[vault_bump],
        ];
        let signer = &[&seeds[..]];

        // Perform the token transfer from Program Vault PDA to User Token Account
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Reset user balance after successful transfer to prevent double spending
        user_account.pending_rewards = 0;

        emit!(RewardClaimed {
            user: ctx.accounts.user.key(),
            amount: amount,
        });

        Ok(())
    }

    /// Admin-only function to update the standard reward amount for future actions.
    pub fn update_reward(ctx: Context<UpdateAdmin>, new_amount: u64) -> Result<()> {
        let state = &mut ctx.accounts.global_state;
        require!(ctx.accounts.admin.key() == state.admin, ErrorCode::Unauthorized);
        state.reward_amount = new_amount;

        emit!(AdminUpdated {
            new_amount: new_amount,
        });

        Ok(())
    }
}

// --- DATA STRUCTURES & VALIDATION ---

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = admin, 
        seeds = [b"state"], 
        bump, 
        space = 8 + 32 + 32 + 8 + 8 + 8 + 1 + 1
    )]
    pub global_state: Account<'info, GlobalState>,
    
    // Vault is a Token Account PDA that holds the reward tokens.
    // It is authorized by its own address (PDA signing).
    #[account(
        init, 
        payer = admin, 
        seeds = [b"vault"], 
        bump, 
        token::mint = mint, 
        token::authority = vault
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(mut, seeds = [b"state"], bump = global_state.state_bump)]
    pub global_state: Account<'info, GlobalState>,
    
    // Derived using user's wallet to ensure 1 account per wallet
    #[account(
        init, 
        payer = user, 
        seeds = [b"user", user.key().as_ref()], 
        bump, 
        space = 8 + 32 + 32 + (4 + 32) + 8 + 8 + 8 + 8 + 1
    )]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteAction<'info> {
    #[account(mut, seeds = [b"state"], bump = global_state.state_bump)]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub l1_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub l2_account: Account<'info, UserAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(seeds = [b"state"], bump = global_state.state_bump)]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(mut, seeds = [b"user", user.key().as_ref()], bump)]
    pub user_account: Account<'info, UserAccount>,
    
    #[account(mut, seeds = [b"vault"], bump = global_state.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    
    // Automatically creates the user's Associated Token Account if it doesn't exist
    #[account(
        init_if_needed, 
        payer = user, 
        associated_token::mint = mint, 
        associated_token::authority = user
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(mut, seeds = [b"state"], bump = global_state.state_bump)]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}

// --- STATE DEFINITIONS ---

#[account]
pub struct GlobalState {
    pub admin: Pubkey,            // Authorized admin address
    pub mint: Pubkey,             // Token used for rewards
    pub reward_amount: u64,       // Reward amount in atoms
    pub total_distributed: u64,   // Total tokens claimed so far
    pub total_users: u64,         // Total count of registered users
    pub state_bump: u8,           // PDA bump for global state
    pub vault_bump: u8,           // PDA bump for token vault
}

#[account]
pub struct UserAccount {
    pub wallet: Pubkey,           // The user's wallet address
    pub referrer: Pubkey,         // Address of the user who referred them
    pub name: String,             // User's chosen display name
    pub pending_rewards: u64,     // Rewards earned but not yet claimed
    pub total_earned: u64,        // Lifetime earnings
    pub total_referrals: u64,     // Number of people this user referred
    pub joined_at: i64,           // Timestamp of registration
    pub initialized: bool,        // Flag to prevent re-registration
}

#[event]
pub struct UserRegistered { pub user: Pubkey, pub name: String }
#[event]
pub struct ActionCompleted { pub l1_user: Pubkey, pub total_distributed: u64 }
#[event]
pub struct RewardClaimed { pub user: Pubkey, pub amount: u64 }
#[event]
pub struct AdminUpdated { pub new_amount: u64 }

#[error_code]
pub enum ErrorCode {
    #[msg("Already registered")] AlreadyRegistered,
    #[msg("Unauthorized")] Unauthorized,
    #[msg("Nothing to claim")] NothingToClaim,
    #[msg("Name is too long")] NameTooLong,
}



