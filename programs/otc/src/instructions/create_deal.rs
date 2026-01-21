use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::error::ErrorCode;
use crate::state::{DealAccount, DealStatus};
use crate::DealCreated;

const COMP_DEF_OFFSET: u32 = comp_def_offset("create_deal");
use crate::{SignerAccount, ID, ID_CONST};

pub fn handler(
    ctx: Context<CreateDeal>,
    computation_offset: u64,
    controller: Pubkey,
    encryption_pubkey: [u8; 32],
    nonce: u128,
    expires_at: i64,
    allow_partial: bool,
    encrypted_amount: [u8; 32],
    encrypted_price: [u8; 32],
) -> Result<()> {
    // Initialize DealAccount plaintext fields
    let deal = &mut ctx.accounts.deal;
    deal.create_key = ctx.accounts.create_key.key();
    deal.controller = controller;
    deal.encryption_pubkey = encryption_pubkey;
    deal.base_mint = ctx.accounts.base_mint.key();
    deal.quote_mint = ctx.accounts.quote_mint.key();
    deal.created_at = 0; // Will be set in callback
    deal.expires_at = expires_at;
    deal.status = DealStatus::OPEN;
    deal.allow_partial = allow_partial;
    deal.num_offers = 0;
    deal.bump = ctx.bumps.deal;

    // Build ArgBuilder for Enc<Shared, DealInput>:
    // - x25519_pubkey (creator's pubkey)
    // - plaintext_u128 (nonce)
    // - encrypted_u64 (amount)
    // - encrypted_u128 (price)
    let args = ArgBuilder::new()
        .x25519_pubkey(encryption_pubkey)
        .plaintext_u128(nonce)
        .encrypted_u64(encrypted_amount)
        .encrypted_u128(encrypted_price)
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![CreateDealCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.deal.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn callback_handler(
    ctx: Context<CreateDealCallback>,
    output: SignedComputationOutputs<CreateDealOutput>,
) -> Result<()> {
    // Verify and extract output
    // The return type is (Enc<Mxe, DealState>, Enc<Shared, DealCreatedBlob>)
    // Arcium generates CreateDealOutputStruct0 with field_0 (MXE) and field_1 (Shared)
    let tuple_output = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(CreateDealOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Access tuple elements via generated struct fields
    let mxe_state = &tuple_output.field_0;
    let shared_blob = &tuple_output.field_1;

    // Store MXE-encrypted state in deal account
    let deal = &mut ctx.accounts.deal;
    deal.nonce = mxe_state.nonce.to_le_bytes();
    deal.ciphertexts = mxe_state.ciphertexts;

    // Set created_at timestamp
    deal.created_at = Clock::get()?.unix_timestamp;

    // Emit DealCreated event with shared blob for creator
    emit!(DealCreated {
        deal: deal.key(),
        base_mint: deal.base_mint,
        quote_mint: deal.quote_mint,
        expires_at: deal.expires_at,
        allow_partial: deal.allow_partial,
        encryption_key: shared_blob.encryption_key,
        nonce: shared_blob.nonce.to_le_bytes(),
        ciphertexts: shared_blob.ciphertexts,
    });

    Ok(())
}

pub fn init_comp_def_handler(ctx: Context<InitCreateDealCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

#[init_computation_definition_accounts("create_deal", payer)]
#[derive(Accounts)]
pub struct InitCreateDealCompDef<'info> {
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

#[queue_computation_accounts("create_deal", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CreateDeal<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Ephemeral signer for PDA uniqueness
    pub create_key: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + DealAccount::INIT_SPACE,
        seeds = [b"deal", create_key.key().as_ref()],
        bump,
    )]
    pub deal: Account<'info, DealAccount>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

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

#[callback_accounts("create_deal")]
#[derive(Accounts)]
pub struct CreateDealCallback<'info> {
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
    pub deal: Account<'info, DealAccount>,
}
