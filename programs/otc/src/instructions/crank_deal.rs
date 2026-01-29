use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::error::ErrorCode;
use crate::state::{BalanceAccount, DealAccount, DealStatus};
use crate::state::{BALANCE_CIPHERTEXT_LENGTH, BALANCE_CIPHERTEXT_OFFSET};
use crate::state::{DEAL_CIPHERTEXT_LENGTH, DEAL_CIPHERTEXT_OFFSET};
use crate::{BalanceUpdated, DealSettled};

const COMP_DEF_OFFSET: u32 = comp_def_offset("crank_deal");
use crate::{SignerAccount, ID, ID_CONST};

pub fn handler(
    ctx: Context<CrankDeal>,
    computation_offset: u64,
    creator_deal_blob_nonce: u128,
    creator_balance_blob_nonce: u128,
) -> Result<()> {
    // Capture keys and nonce before mutable borrows
    let deal_key = ctx.accounts.deal.key();
    let creator_balance_key = ctx.accounts.creator_balance.key();
    let deal_nonce = u128::from_le_bytes(ctx.accounts.deal.nonce);
    let creator_balance_nonce = u128::from_le_bytes(ctx.accounts.creator_balance.nonce);

    // Validate deal is open
    require!(
        ctx.accounts.deal.status == DealStatus::OPEN,
        ErrorCode::DealNotOpen
    );

    // Determine if deal has expired
    let now = Clock::get()?.unix_timestamp;
    let is_expired = ctx.accounts.deal.expires_at <= now;

    // Authorization check: anyone can crank after expiry, only controller before
    if !is_expired {
        require!(
            ctx.accounts.payer.key() == ctx.accounts.deal.controller,
            ErrorCode::NotAuthorized
        );
    }

    let allow_partial = ctx.accounts.deal.allow_partial;

    // Build ArgBuilder for crank_deal instruction:
    // crank_deal(deal_state: Enc<Mxe, &DealState>, creator_balance: Enc<Mxe, &BalanceState>,
    //            creator_deal_blob: Shared, creator_balance_blob: Shared, is_expired: bool, allow_partial: bool)
    let args = ArgBuilder::new()
        // Enc<Mxe, &DealState>
        .plaintext_u128(deal_nonce)
        .account(deal_key, DEAL_CIPHERTEXT_OFFSET, DEAL_CIPHERTEXT_LENGTH)
        // Enc<Mxe, &BalanceState>
        .plaintext_u128(creator_balance_nonce)
        .account(
            creator_balance_key,
            BALANCE_CIPHERTEXT_OFFSET,
            BALANCE_CIPHERTEXT_LENGTH,
        )
        // Shared marker for deal blob
        .x25519_pubkey(ctx.accounts.deal.encryption_pubkey)
        .plaintext_u128(creator_deal_blob_nonce)
        // Shared marker for balance blob
        .x25519_pubkey(ctx.accounts.deal.encryption_pubkey)
        .plaintext_u128(creator_balance_blob_nonce)
        // Plaintext booleans
        .plaintext_bool(is_expired)
        .plaintext_bool(allow_partial)
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![CrankDealCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: deal_key,
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: creator_balance_key,
                    is_writable: true,
                },
            ],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn callback_handler(
    ctx: Context<CrankDealCallback>,
    output: SignedComputationOutputs<CrankDealOutput>,
) -> Result<()> {
    // Verify and extract output
    // The return type is (Enc<Mxe, BalanceState>, Enc<Shared, DealSettledBlob>, Enc<Shared, BalanceUpdatedBlob>, u8)
    let tuple_output = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(CrankDealOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Access tuple elements via generated struct fields
    let balance_state = &tuple_output.field_0;
    let deal_blob = &tuple_output.field_1;
    let balance_blob = &tuple_output.field_2;
    let status = tuple_output.field_3;

    // Only update if status changed (status != 0 means EXECUTED or EXPIRED)
    if status != 0 {
        let deal = &mut ctx.accounts.deal;
        deal.status = status;

        // Update creator's balance MXE state
        let balance = &mut ctx.accounts.creator_balance;
        balance.nonce = balance_state.nonce.to_le_bytes();
        balance.ciphertexts = balance_state.ciphertexts;

        // Emit DealSettled event with shared blob for creator
        emit!(DealSettled {
            deal: deal.key(),
            status,
            settled_at: Clock::get()?.unix_timestamp,
            encryption_key: deal_blob.encryption_key,
            nonce: deal_blob.nonce.to_le_bytes(),
            ciphertexts: deal_blob.ciphertexts,
        });

        // Emit BalanceUpdated event for creator
        emit!(BalanceUpdated {
            balance: balance.key(),
            controller: balance.controller,
            mint: balance.mint,
            encryption_key: balance_blob.encryption_key,
            nonce: balance_blob.nonce.to_le_bytes(),
            ciphertexts: balance_blob.ciphertexts,
        });
    }

    Ok(())
}

pub fn init_comp_def_handler(ctx: Context<InitCrankDealCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

#[init_computation_definition_accounts("crank_deal", payer)]
#[derive(Accounts)]
pub struct InitCrankDealCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    /// Can't check it here as it's not initialized yet.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("crank_deal", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CrankDeal<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub deal: Box<Account<'info, DealAccount>>,

    /// Creator's BASE token balance (for releasing commitment and refund)
    #[account(
        mut,
        seeds = [b"balance", deal.controller.as_ref(), deal.base_mint.as_ref()],
        bump,
    )]
    pub creator_balance: Box<Account<'info, BalanceAccount>>,

    // --- Arcium accounts (auto-generated pattern) ---
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(
        mut,
        address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS,
    )]
    pub pool_account: Account<'info, FeePool>,
    #[account(
        address = ARCIUM_CLOCK_ACCOUNT_ADDRESS
    )]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("crank_deal")]
#[derive(Accounts)]
pub struct CrankDealCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(COMP_DEF_OFFSET)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub deal: Box<Account<'info, DealAccount>>,
    #[account(mut)]
    pub creator_balance: Box<Account<'info, BalanceAccount>>,
}
