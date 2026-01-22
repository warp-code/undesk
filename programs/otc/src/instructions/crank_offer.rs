use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::error::ErrorCode;
use crate::events::OfferSettled;
use crate::state::{DealAccount, DealStatus, OfferAccount, OfferStatus};
use crate::state::{OFFER_CIPHERTEXT_LENGTH, OFFER_CIPHERTEXT_OFFSET};

const COMP_DEF_OFFSET: u32 = comp_def_offset("crank_offer");
use crate::{SignerAccount, ID, ID_CONST};

pub fn handler(
    ctx: Context<CrankOffer>,
    computation_offset: u64,
    offeror_encryption_pubkey: [u8; 32],
    offeror_nonce: u128,
) -> Result<()> {
    let offer_key = ctx.accounts.offer.key();
    let offer_nonce = u128::from_le_bytes(ctx.accounts.offer.nonce);

    // Constraints
    require!(
        ctx.accounts.deal.status != DealStatus::OPEN,
        ErrorCode::DealNotSettled
    );
    require!(
        ctx.accounts.offer.status != OfferStatus::SETTLED,
        ErrorCode::OfferAlreadySettled
    );

    // Derive deal_success from deal.status (plaintext)
    let deal_success = ctx.accounts.deal.status == DealStatus::EXECUTED;

    // ArgBuilder pattern for crank_offer:
    // - Enc<Mxe, &OfferState>: nonce + account reference
    // - Shared marker: x25519_pubkey + nonce
    // - Plaintext bool: deal_success
    let args = ArgBuilder::new()
        .plaintext_u128(offer_nonce)
        .account(offer_key, OFFER_CIPHERTEXT_OFFSET, OFFER_CIPHERTEXT_LENGTH)
        .x25519_pubkey(offeror_encryption_pubkey)
        .plaintext_u128(offeror_nonce)
        .plaintext_bool(deal_success)
        .build();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![CrankOfferCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: offer_key,
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn callback_handler(
    ctx: Context<CrankOfferCallback>,
    output: SignedComputationOutputs<CrankOfferOutput>,
) -> Result<()> {
    let shared_blob = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(CrankOfferOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    let offer = &mut ctx.accounts.offer;
    offer.status = OfferStatus::SETTLED;

    emit!(OfferSettled {
        deal: offer.deal,
        offer: offer.key(),
        offer_index: offer.offer_index,
        encryption_key: shared_blob.encryption_key,
        nonce: shared_blob.nonce.to_le_bytes(),
        ciphertexts: shared_blob.ciphertexts,
    });

    Ok(())
}

pub fn init_comp_def_handler(ctx: Context<InitCrankOfferCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

#[init_computation_definition_accounts("crank_offer", payer)]
#[derive(Accounts)]
pub struct InitCrankOfferCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("crank_offer", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CrankOffer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Deal account (read-only, for status check)
    pub deal: Box<Account<'info, DealAccount>>,

    /// Offer account (for encrypted state reference)
    #[account(
        mut,
        constraint = offer.deal == deal.key() @ ErrorCode::DealMismatch,
    )]
    pub offer: Box<Account<'info, OfferAccount>>,

    // --- Arcium accounts ---
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("crank_offer")]
#[derive(Accounts)]
pub struct CrankOfferCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub offer: Box<Account<'info, OfferAccount>>,
}
