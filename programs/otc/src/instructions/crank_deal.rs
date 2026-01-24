use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::error::ErrorCode;
use crate::state::{DealAccount, DealStatus};
use crate::state::{DEAL_CIPHERTEXT_LENGTH, DEAL_CIPHERTEXT_OFFSET};
use crate::DealSettled;

const COMP_DEF_OFFSET: u32 = comp_def_offset("crank_deal");
use crate::{SignerAccount, ID, ID_CONST};

pub fn handler(
    ctx: Context<CrankDeal>,
    computation_offset: u64,
    creator_nonce: u128,
) -> Result<()> {
    // Capture keys and nonce before mutable borrows
    let deal_key = ctx.accounts.deal.key();
    let deal_nonce = u128::from_le_bytes(ctx.accounts.deal.nonce);

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

    // Build ArgBuilder:
    // - Enc<Mxe, &DealState> - nonce as plaintext, then account reference to ciphertext
    // - Shared marker for creator - x25519_pubkey and nonce
    // - Plaintext booleans (as u8)
    let args = ArgBuilder::new()
        // Enc<Mxe, &DealState>
        .plaintext_u128(deal_nonce)
        .account(deal_key, DEAL_CIPHERTEXT_OFFSET, DEAL_CIPHERTEXT_LENGTH)
        // Shared marker for creator
        .x25519_pubkey(ctx.accounts.deal.encryption_pubkey)
        .plaintext_u128(creator_nonce)
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
            &[CallbackAccount {
                pubkey: deal_key,
                is_writable: true,
            }],
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
    // The return type is (Enc<Shared, DealSettledBlob>, u8)
    let tuple_output = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(CrankDealOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Access tuple elements via generated struct fields
    let shared_blob = &tuple_output.field_0;
    let status = tuple_output.field_1;

    // Only update if status changed (status != 0 means EXECUTED or EXPIRED)
    if status != 0 {
        let deal = &mut ctx.accounts.deal;
        deal.status = status;

        // Emit DealSettled event with shared blob for creator
        emit!(DealSettled {
            deal: deal.key(),
            status,
            settled_at: Clock::get()?.unix_timestamp,
            encryption_key: shared_blob.encryption_key,
            nonce: shared_blob.nonce.to_le_bytes(),
            ciphertexts: shared_blob.ciphertexts,
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
}
