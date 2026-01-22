mod error;
mod events;
mod instructions;
mod state;

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

pub use error::ErrorCode;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("CfwbKvb1wuJbi6h2B1MoRmGU6YWEUHTPL82TvHtcrV1");

#[arcium_program]
pub mod otc {
    use super::*;

    // Add Together
    pub fn init_add_together_comp_def(ctx: Context<InitAddTogetherCompDef>) -> Result<()> {
        instructions::add_together::init_comp_def_handler(ctx)
    }

    pub fn add_together(
        ctx: Context<AddTogether>,
        computation_offset: u64,
        ciphertext_0: [u8; 32],
        ciphertext_1: [u8; 32],
        pubkey: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        instructions::add_together::handler(
            ctx,
            computation_offset,
            ciphertext_0,
            ciphertext_1,
            pubkey,
            nonce,
        )
    }

    #[arcium_callback(encrypted_ix = "add_together")]
    pub fn add_together_callback(
        ctx: Context<AddTogetherCallback>,
        output: SignedComputationOutputs<AddTogetherOutput>,
    ) -> Result<()> {
        instructions::add_together::callback_handler(ctx, output)
    }

    // Init Counter
    pub fn init_init_counter_comp_def(ctx: Context<InitInitCounterCompDef>) -> Result<()> {
        instructions::init_counter::init_comp_def_handler(ctx)
    }

    pub fn init_counter(
        ctx: Context<InitCounter>,
        computation_offset: u64,
        nonce: u128,
    ) -> Result<()> {
        instructions::init_counter::handler(ctx, computation_offset, nonce)
    }

    #[arcium_callback(encrypted_ix = "init_counter")]
    pub fn init_counter_callback(
        ctx: Context<InitCounterCallback>,
        output: SignedComputationOutputs<InitCounterOutput>,
    ) -> Result<()> {
        instructions::init_counter::callback_handler(ctx, output)
    }

    // Increment Counter
    pub fn init_increment_counter_comp_def(
        ctx: Context<InitIncrementCounterCompDef>,
    ) -> Result<()> {
        instructions::increment_counter::init_comp_def_handler(ctx)
    }

    pub fn increment_counter(ctx: Context<IncrementCounter>, computation_offset: u64) -> Result<()> {
        instructions::increment_counter::handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "increment_counter")]
    pub fn increment_counter_callback(
        ctx: Context<IncrementCounterCallback>,
        output: SignedComputationOutputs<IncrementCounterOutput>,
    ) -> Result<()> {
        instructions::increment_counter::callback_handler(ctx, output)
    }

    // Get Counter
    pub fn init_get_counter_comp_def(ctx: Context<InitGetCounterCompDef>) -> Result<()> {
        instructions::get_counter::init_comp_def_handler(ctx)
    }

    pub fn get_counter(
        ctx: Context<GetCounter>,
        computation_offset: u64,
        recipient_pubkey: [u8; 32],
        recipient_nonce: u128,
        pubkey_hi: u128,
        pubkey_lo: u128,
    ) -> Result<()> {
        instructions::get_counter::handler(
            ctx,
            computation_offset,
            recipient_pubkey,
            recipient_nonce,
            pubkey_hi,
            pubkey_lo,
        )
    }

    #[arcium_callback(encrypted_ix = "get_counter")]
    pub fn get_counter_callback(
        ctx: Context<GetCounterCallback>,
        output: SignedComputationOutputs<GetCounterOutput>,
    ) -> Result<()> {
        instructions::get_counter::callback_handler(ctx, output)
    }

    // Create Deal
    pub fn init_create_deal_comp_def(ctx: Context<InitCreateDealCompDef>) -> Result<()> {
        instructions::create_deal::init_comp_def_handler(ctx)
    }

    pub fn create_deal(
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
        instructions::create_deal::handler(
            ctx,
            computation_offset,
            controller,
            encryption_pubkey,
            nonce,
            expires_at,
            allow_partial,
            encrypted_amount,
            encrypted_price,
        )
    }

    #[arcium_callback(encrypted_ix = "create_deal")]
    pub fn create_deal_callback(
        ctx: Context<CreateDealCallback>,
        output: SignedComputationOutputs<CreateDealOutput>,
    ) -> Result<()> {
        instructions::create_deal::callback_handler(ctx, output)
    }

    // Submit Offer
    pub fn init_submit_offer_comp_def(ctx: Context<InitSubmitOfferCompDef>) -> Result<()> {
        instructions::submit_offer::init_comp_def_handler(ctx)
    }

    pub fn submit_offer(
        ctx: Context<SubmitOffer>,
        computation_offset: u64,
        controller: Pubkey,
        encryption_pubkey: [u8; 32],
        nonce: u128,
        encrypted_price: [u8; 32],
        encrypted_amount: [u8; 32],
    ) -> Result<()> {
        instructions::submit_offer::handler(
            ctx,
            computation_offset,
            controller,
            encryption_pubkey,
            nonce,
            encrypted_price,
            encrypted_amount,
        )
    }

    #[arcium_callback(encrypted_ix = "submit_offer")]
    pub fn submit_offer_callback(
        ctx: Context<SubmitOfferCallback>,
        output: SignedComputationOutputs<SubmitOfferOutput>,
    ) -> Result<()> {
        instructions::submit_offer::callback_handler(ctx, output)
    }

    // Crank Deal
    pub fn init_crank_deal_comp_def(ctx: Context<InitCrankDealCompDef>) -> Result<()> {
        instructions::crank_deal::init_comp_def_handler(ctx)
    }

    pub fn crank_deal(
        ctx: Context<CrankDeal>,
        computation_offset: u64,
        creator_encryption_pubkey: [u8; 32],
        creator_nonce: u128,
    ) -> Result<()> {
        instructions::crank_deal::handler(
            ctx,
            computation_offset,
            creator_encryption_pubkey,
            creator_nonce,
        )
    }

    #[arcium_callback(encrypted_ix = "crank_deal")]
    pub fn crank_deal_callback(
        ctx: Context<CrankDealCallback>,
        output: SignedComputationOutputs<CrankDealOutput>,
    ) -> Result<()> {
        instructions::crank_deal::callback_handler(ctx, output)
    }

    // Crank Offer
    pub fn init_crank_offer_comp_def(ctx: Context<InitCrankOfferCompDef>) -> Result<()> {
        instructions::crank_offer::init_comp_def_handler(ctx)
    }

    pub fn crank_offer(
        ctx: Context<CrankOffer>,
        computation_offset: u64,
        offeror_encryption_pubkey: [u8; 32],
        offeror_nonce: u128,
    ) -> Result<()> {
        instructions::crank_offer::handler(
            ctx,
            computation_offset,
            offeror_encryption_pubkey,
            offeror_nonce,
        )
    }

    #[arcium_callback(encrypted_ix = "crank_offer")]
    pub fn crank_offer_callback(
        ctx: Context<CrankOfferCallback>,
        output: SignedComputationOutputs<CrankOfferOutput>,
    ) -> Result<()> {
        instructions::crank_offer::callback_handler(ctx, output)
    }
}
