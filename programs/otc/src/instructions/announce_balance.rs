use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::error::ErrorCode;
use crate::state::{BalanceAccount, BALANCE_CIPHERTEXT_LENGTH, BALANCE_CIPHERTEXT_OFFSET};
use crate::BalanceUpdated;

const COMP_DEF_OFFSET: u32 = comp_def_offset("announce_balance");
use crate::{SignerAccount, ID, ID_CONST};

pub fn handler(
    ctx: Context<AnnounceBalance>,
    computation_offset: u64,
    controller: Pubkey,
    encryption_pubkey: [u8; 32],
    owner_nonce: u128,
) -> Result<()> {
    // Extract keys before mutable borrow
    let balance_key = ctx.accounts.balance.key();

    // Get nonce before mutable borrow
    let balance_nonce = u128::from_le_bytes(ctx.accounts.balance.nonce);

    // Verify the controller matches
    require!(
        ctx.accounts.balance.controller == controller,
        ErrorCode::ControllerMismatch
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Build ArgBuilder for announce_balance instruction:
    // announce_balance(balance_state: Enc<Mxe, &BalanceState>, owner: Shared)
    let args = ArgBuilder::new()
        // Enc<Mxe, &BalanceState> - nonce then account reference
        .plaintext_u128(balance_nonce)
        .account(
            balance_key,
            BALANCE_CIPHERTEXT_OFFSET,
            BALANCE_CIPHERTEXT_LENGTH,
        )
        // Shared marker - pubkey then nonce
        .x25519_pubkey(encryption_pubkey)
        .plaintext_u128(owner_nonce)
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![AnnounceBalanceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: balance_key,
                is_writable: false,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn callback_handler(
    ctx: Context<AnnounceBalanceCallback>,
    output: SignedComputationOutputs<AnnounceBalanceOutput>,
) -> Result<()> {
    // Verify and extract output
    // Return type is Enc<Shared, BalanceUpdatedBlob>
    let shared_blob = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(AnnounceBalanceOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Emit BalanceUpdated event with shared blob for owner
    let balance = &ctx.accounts.balance;
    emit!(BalanceUpdated {
        balance: balance.key(),
        controller: balance.controller,
        mint: balance.mint,
        encryption_key: shared_blob.encryption_key,
        nonce: shared_blob.nonce.to_le_bytes(),
        ciphertexts: shared_blob.ciphertexts,
    });

    Ok(())
}

pub fn init_comp_def_handler(ctx: Context<InitAnnounceBalanceCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

#[init_computation_definition_accounts("announce_balance", payer)]
#[derive(Accounts)]
pub struct InitAnnounceBalanceCompDef<'info> {
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

#[queue_computation_accounts("announce_balance", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, controller: Pubkey)]
pub struct AnnounceBalance<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The controller signer (derived from wallet signature)
    pub controller_signer: Signer<'info>,

    /// Balance account to announce (read-only)
    #[account(
        seeds = [b"balance", controller.as_ref(), balance.mint.as_ref()],
        bump,
        constraint = controller_signer.key() == controller @ ErrorCode::ControllerMismatch,
    )]
    pub balance: Account<'info, BalanceAccount>,

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

#[callback_accounts("announce_balance")]
#[derive(Accounts)]
pub struct AnnounceBalanceCallback<'info> {
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
    pub balance: Account<'info, BalanceAccount>,
}
