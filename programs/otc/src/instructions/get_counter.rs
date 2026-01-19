use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::error::ErrorCode;

const COMP_DEF_OFFSET: u32 = comp_def_offset("get_counter");
use crate::state::{Counter, COUNTER_CIPHERTEXT_LENGTH, COUNTER_CIPHERTEXT_OFFSET};
use crate::{SignerAccount, ID, ID_CONST};

pub fn init_comp_def_handler(ctx: Context<InitGetCounterCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

/// Queue a get_counter computation to read and re-encrypt the counter for the caller.
/// The result will be encrypted with a shared secret so the caller can decrypt it.
pub fn handler(
    ctx: Context<GetCounter>,
    computation_offset: u64,
    recipient_pubkey: [u8; 32],
    recipient_nonce: u128,
    pubkey_hi: u128,
    pubkey_lo: u128,
) -> Result<()> {
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // For Enc<Mxe, &T> by reference:
    // - Pass nonce from account as plaintext
    // - Pass account reference to just the ciphertext portion
    // For Shared recipient marker: pass x25519 public key and nonce for output encryption
    let mxe_nonce = u128::from_le_bytes(ctx.accounts.counter.nonce);
    let args = ArgBuilder::new()
        .plaintext_u128(mxe_nonce)
        .account(
            ctx.accounts.counter.key(),
            COUNTER_CIPHERTEXT_OFFSET,
            COUNTER_CIPHERTEXT_LENGTH,
        )
        .x25519_pubkey(recipient_pubkey)
        .plaintext_u128(recipient_nonce)
        .plaintext_u128(pubkey_hi)
        .plaintext_u128(pubkey_lo)
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![GetCounterCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[],
        )?],
        1,
        0,
    )?;

    Ok(())
}

pub fn callback_handler(
    ctx: Context<GetCounterCallback>,
    output: SignedComputationOutputs<GetCounterOutput>,
) -> Result<()> {
    // Tuple return type is wrapped: field_0 contains the tuple, with field_0/field_1 inside
    let (o1, o2) = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(GetCounterOutput { field_0 }) => (field_0.field_0, field_0.field_1),
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Emit an event with the re-encrypted counter value for the recipient
    emit!(CounterValueEvent {
        encryption_key: o1.encryption_key,
        nonce: o1.nonce.to_le_bytes(),
        ciphertext: o1.ciphertexts[0],
    });

    // Emit a second event for the pubkey_hi/pubkey_lo user
    emit!(CounterValueEvent {
        encryption_key: o2.encryption_key,
        nonce: o2.nonce.to_le_bytes(),
        ciphertext: o2.ciphertexts[0],
    });

    Ok(())
}

#[init_computation_definition_accounts("get_counter", payer)]
#[derive(Accounts)]
pub struct InitGetCounterCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("get_counter", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct GetCounter<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
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
    pub mxe_account: Account<'info, MXEAccount>,
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
    /// The counter account to read from
    pub counter: Account<'info, Counter>,
}

#[callback_accounts("get_counter")]
#[derive(Accounts)]
pub struct GetCounterCallback<'info> {
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
}

#[event]
pub struct CounterValueEvent {
    pub encryption_key: [u8; 32],
    pub nonce: [u8; 16],
    pub ciphertext: [u8; 32],
}
