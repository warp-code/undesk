use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::error::ErrorCode;
use crate::state::{BalanceAccount, DealAccount, DealStatus};
use crate::state::{BALANCE_CIPHERTEXT_LENGTH, BALANCE_CIPHERTEXT_OFFSET};
use crate::{BalanceUpdated, DealCreated};

const COMP_DEF_OFFSET: u32 = comp_def_offset("create_deal");
use crate::{SignerAccount, ID, ID_CONST};

pub fn handler(
    ctx: Context<CreateDeal>,
    computation_offset: u64,
    controller: Pubkey,
    encryption_pubkey: [u8; 32],
    nonce: u128,
    balance_blob_nonce: u128,
    expires_at: i64,
    allow_partial: bool,
    encrypted_amount: [u8; 32],
    encrypted_price: [u8; 32],
) -> Result<()> {
    // Capture keys and nonce before mutable borrows
    let deal_key = ctx.accounts.deal.key();
    let creator_balance_key = ctx.accounts.creator_balance.key();
    let creator_balance_nonce = u128::from_le_bytes(ctx.accounts.creator_balance.nonce);

    // Verify the balance controller matches
    require!(
        ctx.accounts.creator_balance.controller == controller,
        ErrorCode::ControllerMismatch
    );

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

    // Build ArgBuilder for create_deal instruction:
    // create_deal(deal_data: Enc<Shared, DealInput>, creator_balance: Enc<Mxe, &BalanceState>, creator: Shared)
    //
    // Enc<Shared, DealInput>: x25519_pubkey + nonce + encrypted fields
    // Enc<Mxe, &BalanceState>: nonce + account reference
    // Shared marker: x25519_pubkey + nonce
    let args = ArgBuilder::new()
        // Enc<Shared, DealInput>
        .x25519_pubkey(encryption_pubkey)
        .plaintext_u128(nonce)
        .encrypted_u64(encrypted_amount)
        .encrypted_u128(encrypted_price)
        // Enc<Mxe, &BalanceState>
        .plaintext_u128(creator_balance_nonce)
        .account(
            creator_balance_key,
            BALANCE_CIPHERTEXT_OFFSET,
            BALANCE_CIPHERTEXT_LENGTH,
        )
        // Shared marker for balance blob
        .x25519_pubkey(encryption_pubkey)
        .plaintext_u128(balance_blob_nonce)
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
    ctx: Context<CreateDealCallback>,
    output: SignedComputationOutputs<CreateDealOutput>,
) -> Result<()> {
    // Verify and extract output
    // The return type is (Enc<Mxe, DealState>, Enc<Mxe, BalanceState>, Enc<Shared, DealCreatedBlob>, Enc<Shared, BalanceUpdatedBlob>)
    let tuple_output = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(CreateDealOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Access tuple elements via generated struct fields
    let mxe_deal_state = &tuple_output.field_0;
    let mxe_balance_state = &tuple_output.field_1;
    let deal_blob = &tuple_output.field_2;
    let balance_blob = &tuple_output.field_3;

    // Store MXE-encrypted state in deal account
    let deal = &mut ctx.accounts.deal;
    deal.nonce = mxe_deal_state.nonce.to_le_bytes();
    deal.ciphertexts = mxe_deal_state.ciphertexts;

    // Set created_at timestamp
    deal.created_at = Clock::get()?.unix_timestamp;

    // Store MXE-encrypted state in creator balance account
    let balance = &mut ctx.accounts.creator_balance;
    balance.nonce = mxe_balance_state.nonce.to_le_bytes();
    balance.ciphertexts = mxe_balance_state.ciphertexts;

    // Emit DealCreated event with shared blob for creator
    emit!(DealCreated {
        deal: deal.key(),
        base_mint: deal.base_mint,
        quote_mint: deal.quote_mint,
        expires_at: deal.expires_at,
        allow_partial: deal.allow_partial,
        created_at: deal.created_at,
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
#[instruction(computation_offset: u64, controller: Pubkey)]
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

    /// Creator's BASE token balance (must exist and have sufficient funds)
    #[account(
        mut,
        seeds = [b"balance", controller.as_ref(), base_mint.key().as_ref()],
        bump,
    )]
    pub creator_balance: Box<Account<'info, BalanceAccount>>,

    pub base_mint: Box<Account<'info, Mint>>,
    pub quote_mint: Box<Account<'info, Mint>>,

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
    pub deal: Box<Account<'info, DealAccount>>,
    #[account(mut)]
    pub creator_balance: Box<Account<'info, BalanceAccount>>,
}
