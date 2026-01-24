use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::error::ErrorCode;
use crate::state::{DealAccount, DealStatus, OfferAccount, OfferStatus};
use crate::state::{DEAL_CIPHERTEXT_LENGTH, DEAL_CIPHERTEXT_OFFSET};
use crate::OfferCreated;

const COMP_DEF_OFFSET: u32 = comp_def_offset("submit_offer");
use crate::{SignerAccount, ID, ID_CONST};

pub fn handler(
    ctx: Context<SubmitOffer>,
    computation_offset: u64,
    controller: Pubkey,
    encryption_pubkey: [u8; 32],
    nonce: u128,
    encrypted_price: [u8; 32],
    encrypted_amount: [u8; 32],
) -> Result<()> {
    // Capture keys and nonce before mutable borrows to avoid borrow checker issues
    let deal_key = ctx.accounts.deal.key();
    let offer_key = ctx.accounts.offer.key();
    let deal_nonce = u128::from_le_bytes(ctx.accounts.deal.nonce);

    // Validate deal is open
    require!(
        ctx.accounts.deal.status == DealStatus::OPEN,
        ErrorCode::DealNotOpen
    );

    // Validate deal has not expired
    let now = Clock::get()?.unix_timestamp;
    require!(ctx.accounts.deal.expires_at > now, ErrorCode::DealExpired);

    // Initialize OfferAccount plaintext fields
    {
        let deal = &ctx.accounts.deal;
        let offer = &mut ctx.accounts.offer;
        offer.create_key = ctx.accounts.create_key.key();
        offer.controller = controller;
        offer.encryption_pubkey = encryption_pubkey;
        offer.deal = deal_key;
        offer.submitted_at = 0; // Will be set in callback
        offer.offer_index = deal.num_offers;
        offer.status = OfferStatus::OPEN;
        offer.bump = ctx.bumps.offer;
    }

    // Increment offer counter
    ctx.accounts.deal.num_offers += 1;

    // Build ArgBuilder:
    // First: Enc<Mxe, &DealState> - nonce as plaintext, then account reference to ciphertext
    // Second: Enc<Shared, OfferInput> - x25519_pubkey, plaintext nonce, encrypted fields
    let args = ArgBuilder::new()
        // Enc<Mxe, &DealState>
        .plaintext_u128(deal_nonce)
        .account(deal_key, DEAL_CIPHERTEXT_OFFSET, DEAL_CIPHERTEXT_LENGTH)
        // Enc<Shared, OfferInput> - fields ordered as in struct: price (u128), amount (u64)
        .x25519_pubkey(encryption_pubkey)
        .plaintext_u128(nonce)
        .encrypted_u128(encrypted_price)
        .encrypted_u64(encrypted_amount)
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![SubmitOfferCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: deal_key,
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: offer_key,
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
    ctx: Context<SubmitOfferCallback>,
    output: SignedComputationOutputs<SubmitOfferOutput>,
) -> Result<()> {
    // Verify and extract output
    // The return type is (Enc<Mxe, DealState>, Enc<Mxe, OfferState>, Enc<Shared, OfferCreatedBlob>)
    let tuple_output = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(SubmitOfferOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Access tuple elements via generated struct fields
    let updated_deal = &tuple_output.field_0;
    let offer_state = &tuple_output.field_1;
    let shared_blob = &tuple_output.field_2;

    // Update deal's MXE state
    let deal = &mut ctx.accounts.deal;
    deal.nonce = updated_deal.nonce.to_le_bytes();
    deal.ciphertexts = updated_deal.ciphertexts;

    // Store offer's MXE state
    let offer = &mut ctx.accounts.offer;
    offer.nonce = offer_state.nonce.to_le_bytes();
    offer.ciphertexts = offer_state.ciphertexts;

    // Set submitted_at timestamp
    offer.submitted_at = Clock::get()?.unix_timestamp;

    // Emit OfferCreated event with shared blob for offeror
    emit!(OfferCreated {
        deal: deal.key(),
        offer: offer.key(),
        offer_index: offer.offer_index,
        submitted_at: offer.submitted_at,
        encryption_key: shared_blob.encryption_key,
        nonce: shared_blob.nonce.to_le_bytes(),
        ciphertexts: shared_blob.ciphertexts,
    });

    Ok(())
}

pub fn init_comp_def_handler(ctx: Context<InitSubmitOfferCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

#[init_computation_definition_accounts("submit_offer", payer)]
#[derive(Accounts)]
pub struct InitSubmitOfferCompDef<'info> {
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

#[queue_computation_accounts("submit_offer", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SubmitOffer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Ephemeral signer for offer PDA uniqueness
    pub create_key: Signer<'info>,

    #[account(mut)]
    pub deal: Box<Account<'info, DealAccount>>,

    #[account(
        init,
        payer = payer,
        space = 8 + OfferAccount::INIT_SPACE,
        seeds = [b"offer", deal.key().as_ref(), create_key.key().as_ref()],
        bump,
    )]
    pub offer: Box<Account<'info, OfferAccount>>,

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

#[callback_accounts("submit_offer")]
#[derive(Accounts)]
pub struct SubmitOfferCallback<'info> {
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
    pub offer: Box<Account<'info, OfferAccount>>,
}
