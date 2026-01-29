use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::error::ErrorCode;
use crate::events::{BalanceUpdated, OfferSettled};
use crate::state::{BalanceAccount, DealAccount, DealStatus, OfferAccount, OfferStatus};
use crate::state::{BALANCE_CIPHERTEXT_LENGTH, BALANCE_CIPHERTEXT_OFFSET};
use crate::state::{DEAL_CIPHERTEXT_LENGTH, DEAL_CIPHERTEXT_OFFSET};
use crate::state::{OFFER_CIPHERTEXT_LENGTH, OFFER_CIPHERTEXT_OFFSET};

const COMP_DEF_OFFSET: u32 = comp_def_offset("crank_offer");
use crate::{SignerAccount, ID, ID_CONST};

pub fn handler(
    ctx: Context<CrankOffer>,
    computation_offset: u64,
    offeror_offer_blob_nonce: u128,
    offeror_balance_blob_nonce: u128,
) -> Result<()> {
    // Capture keys and nonces before mutable borrows
    let deal_key = ctx.accounts.deal.key();
    let offer_key = ctx.accounts.offer.key();
    let offeror_balance_key = ctx.accounts.offeror_balance.key();
    let deal_nonce = u128::from_le_bytes(ctx.accounts.deal.nonce);
    let offer_nonce = u128::from_le_bytes(ctx.accounts.offer.nonce);
    let offeror_balance_nonce = u128::from_le_bytes(ctx.accounts.offeror_balance.nonce);

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
    // crank_offer(deal_state: Enc<Mxe, &DealState>, offer_state: Enc<Mxe, &OfferState>,
    //             offeror_balance: Enc<Mxe, &BalanceState>, offeror_offer_blob: Shared,
    //             offeror_balance_blob: Shared, deal_success: bool)
    //
    // CRITICAL: Now includes deal state for price calculation (fixing quote units bug)
    let args = ArgBuilder::new()
        // Enc<Mxe, &DealState> - needed for price to calculate quote amounts
        .plaintext_u128(deal_nonce)
        .account(deal_key, DEAL_CIPHERTEXT_OFFSET, DEAL_CIPHERTEXT_LENGTH)
        // Enc<Mxe, &OfferState>
        .plaintext_u128(offer_nonce)
        .account(offer_key, OFFER_CIPHERTEXT_OFFSET, OFFER_CIPHERTEXT_LENGTH)
        // Enc<Mxe, &BalanceState>
        .plaintext_u128(offeror_balance_nonce)
        .account(
            offeror_balance_key,
            BALANCE_CIPHERTEXT_OFFSET,
            BALANCE_CIPHERTEXT_LENGTH,
        )
        // Shared marker for offer blob
        .x25519_pubkey(ctx.accounts.offer.encryption_pubkey)
        .plaintext_u128(offeror_offer_blob_nonce)
        // Shared marker for balance blob
        .x25519_pubkey(ctx.accounts.offer.encryption_pubkey)
        .plaintext_u128(offeror_balance_blob_nonce)
        // Plaintext bool: deal_success
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
            &[
                CallbackAccount {
                    pubkey: offer_key,
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: offeror_balance_key,
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
    ctx: Context<CrankOfferCallback>,
    output: SignedComputationOutputs<CrankOfferOutput>,
) -> Result<()> {
    // Verify and extract output
    // The return type is (Enc<Mxe, BalanceState>, Enc<Shared, OfferSettledBlob>, Enc<Shared, BalanceUpdatedBlob>)
    let tuple_output = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(CrankOfferOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Access tuple elements via generated struct fields
    let balance_state = &tuple_output.field_0;
    let offer_blob = &tuple_output.field_1;
    let balance_blob = &tuple_output.field_2;

    let offer = &mut ctx.accounts.offer;
    offer.status = OfferStatus::SETTLED;

    // Update offeror's balance MXE state
    let balance = &mut ctx.accounts.offeror_balance;
    balance.nonce = balance_state.nonce.to_le_bytes();
    balance.ciphertexts = balance_state.ciphertexts;

    emit!(OfferSettled {
        deal: offer.deal,
        offer: offer.key(),
        offer_index: offer.offer_index,
        settled_at: Clock::get()?.unix_timestamp,
        encryption_key: offer_blob.encryption_key,
        nonce: offer_blob.nonce.to_le_bytes(),
        ciphertexts: offer_blob.ciphertexts,
    });

    // Emit BalanceUpdated event for offeror
    emit!(BalanceUpdated {
        balance: balance.key(),
        controller: balance.controller,
        mint: balance.mint,
        encryption_key: balance_blob.encryption_key,
        nonce: balance_blob.nonce.to_le_bytes(),
        ciphertexts: balance_blob.ciphertexts,
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

    /// Deal account (for encrypted state reference - needed for price)
    pub deal: Box<Account<'info, DealAccount>>,

    /// Offer account (for encrypted state reference)
    #[account(
        mut,
        constraint = offer.deal == deal.key() @ ErrorCode::DealMismatch,
    )]
    pub offer: Box<Account<'info, OfferAccount>>,

    /// Offeror's QUOTE token balance (for releasing commitment and refund)
    #[account(
        mut,
        seeds = [b"balance", offer.controller.as_ref(), deal.quote_mint.as_ref()],
        bump,
    )]
    pub offeror_balance: Box<Account<'info, BalanceAccount>>,

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
    #[account(mut)]
    pub offeror_balance: Box<Account<'info, BalanceAccount>>,
}
