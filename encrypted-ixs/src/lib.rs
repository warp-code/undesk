use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    // ============================================
    // STATE
    // ============================================

    pub struct InputValues {
        v1: u8,
        v2: u8,
    }

    #[derive(Copy, Clone)]
    pub struct CounterState {
        counter: u64,
    }

    // ============================================
    // DEAL STRUCTS
    // ============================================

    /// Input from creator (Shared-encrypted)
    pub struct DealInput {
        /// Base asset amount the creator is selling
        amount: u64,
        /// X64.64 fixed-point price (quote per base)
        price: u128,
    }

    /// State stored on-chain (MXE-encrypted)
    #[derive(Copy, Clone)]
    pub struct DealState {
        /// Base asset amount
        amount: u64,
        /// X64.64 fixed-point price
        price: u128,
        /// Running total of filled amount
        fill_amount: u64,
    }

    /// Event blob sealed to creator (emitted on DealCreated)
    #[derive(Copy, Clone)]
    pub struct DealCreatedBlob {
        /// Base asset amount
        amount: u64,
        /// X64.64 fixed-point price
        price: u128,
    }

    /// Settlement blob sealed to creator (emitted on DealSettled)
    #[derive(Copy, Clone)]
    pub struct DealSettledBlob {
        /// Total amount filled across all offers
        total_filled: u64,
        /// Quote tokens the creator receives
        creator_receives: u64,
        /// Base tokens refunded to creator (unfilled)
        creator_refund: u64,
    }

    // ============================================
    // OFFER STRUCTS
    // ============================================

    /// Input from offeror (Shared-encrypted)
    pub struct OfferInput {
        /// X64.64 fixed-point price (max price willing to pay)
        price: u128,
        /// Amount of base asset to buy
        amount: u64,
    }

    /// State stored on-chain (MXE-encrypted)
    #[derive(Copy, Clone)]
    pub struct OfferState {
        /// X64.64 fixed-point price
        price: u128,
        /// Amount of base asset to buy
        amount: u64,
        /// Amount to execute (computed at submission based on deal availability)
        amt_to_execute: u64,
    }

    /// Event blob sealed to offeror (emitted on OfferCreated)
    #[derive(Copy, Clone)]
    pub struct OfferCreatedBlob {
        /// X64.64 fixed-point price
        price: u128,
        /// Amount of base asset to buy
        amount: u64,
    }

    /// Settlement blob sealed to offeror (emitted on OfferSettled)
    #[derive(Copy, Clone)]
    pub struct OfferSettledBlob {
        /// Outcome: EXECUTED(0), PARTIAL(1), FAILED(2)
        outcome: u8,
        /// Amount of base asset bought
        executed_amt: u64,
        /// Quote tokens paid by offeror
        quote_paid: u64,
        /// Quote tokens refunded to offeror (in QUOTE units, not BASE)
        quote_refund: u64,
    }

    // ============================================
    // BALANCE STRUCTS
    // ============================================

    /// Balance state stored on-chain (MXE-encrypted)
    #[derive(Copy, Clone)]
    pub struct BalanceState {
        /// Available balance amount
        amount: u64,
        /// Amount committed to open deals/offers (locked)
        committed_amount: u64,
    }

    /// Event blob sealed to owner (emitted on BalanceUpdated)
    #[derive(Copy, Clone)]
    pub struct BalanceUpdatedBlob {
        /// Current available balance
        amount: u64,
        /// Current committed balance
        committed_amount: u64,
    }

    // ============================================
    // INSTRUCTIONS
    // ============================================

    #[instruction]
    pub fn add_together(input_ctxt: Enc<Shared, InputValues>) -> Enc<Shared, u16> {
        let input = input_ctxt.to_arcis();
        let sum = input.v1 as u16 + input.v2 as u16;
        input_ctxt.owner.from_arcis(sum)
    }

    /// Create a new deal with encrypted parameters.
    /// Locks creator's BASE tokens in committed_amount.
    /// Returns MXE-encrypted state for on-chain storage, updated balance, and encrypted blobs.
    #[instruction]
    pub fn create_deal(
        deal_data: Enc<Shared, DealInput>,
        creator_balance: Enc<Mxe, &BalanceState>,
        creator: Shared,
    ) -> (
        Enc<Mxe, DealState>,
        Enc<Mxe, BalanceState>,
        Enc<Shared, DealCreatedBlob>,
        Enc<Shared, BalanceUpdatedBlob>,
    ) {
        let input = deal_data.to_arcis();
        let balance = *(creator_balance.to_arcis());

        // Lock commitment (creator's BASE tokens)
        let new_balance = BalanceState {
            amount: balance.amount,
            committed_amount: balance.committed_amount + input.amount,
        };

        let state = DealState {
            amount: input.amount,
            price: input.price,
            fill_amount: 0,
        };

        let deal_blob = DealCreatedBlob {
            amount: input.amount,
            price: input.price,
        };

        let balance_blob = BalanceUpdatedBlob {
            amount: new_balance.amount,
            committed_amount: new_balance.committed_amount,
        };

        (
            Mxe::get().from_arcis(state),
            creator_balance.owner.from_arcis(new_balance),
            deal_data.owner.from_arcis(deal_blob),
            creator.from_arcis(balance_blob),
        )
    }

    /// Submit an offer to an existing deal.
    /// Takes MXE-encrypted deal state by reference, Shared-encrypted offer input,
    /// and offeror's balance to lock QUOTE commitment.
    /// Computes amt_to_execute based on price comparison and deal availability.
    /// Returns updated deal state, new offer state, updated balance, and offer blob.
    #[instruction]
    pub fn submit_offer(
        deal_state: Enc<Mxe, &DealState>,
        offer_data: Enc<Shared, OfferInput>,
        offeror_balance: Enc<Mxe, &BalanceState>,
    ) -> (
        Enc<Mxe, DealState>,
        Enc<Mxe, OfferState>,
        Enc<Mxe, BalanceState>,
        Enc<Shared, OfferCreatedBlob>,
    ) {
        let deal = *(deal_state.to_arcis());
        let offer = offer_data.to_arcis();
        let balance = *(offeror_balance.to_arcis());

        // Price comparison: offeror must be willing to pay at least deal price
        let remaining = deal.amount - deal.fill_amount;
        let amt_to_execute = if offer.price >= deal.price {
            if offer.amount < remaining { offer.amount } else { remaining }
        } else {
            0
        };

        // Lock MAX quote commitment (full offer amount at offeror's price, not amt_to_execute - privacy)
        // quote_to_commit = offer.amount * offer.price (X64.64 fixed-point)
        let quote_to_commit = ((offer.amount as u128 * offer.price) >> 64) as u64;
        let new_balance = BalanceState {
            amount: balance.amount,
            committed_amount: balance.committed_amount + quote_to_commit,
        };

        let updated_deal = DealState {
            amount: deal.amount,
            price: deal.price,
            fill_amount: deal.fill_amount + amt_to_execute,
        };

        let offer_state = OfferState {
            price: offer.price,
            amount: offer.amount,
            amt_to_execute,
        };

        let offer_blob = OfferCreatedBlob {
            price: offer.price,
            amount: offer.amount,
        };

        (
            Mxe::get().from_arcis(updated_deal),
            Mxe::get().from_arcis(offer_state),
            offeror_balance.owner.from_arcis(new_balance),
            offer_data.owner.from_arcis(offer_blob),
        )
    }

    /// Announce balance - read balance state and return encrypted blob for owner.
    /// This is a separate instruction to avoid 5-tuple output issues.
    #[instruction]
    pub fn announce_balance(
        balance_state: Enc<Mxe, &BalanceState>,
        owner: Shared,
    ) -> Enc<Shared, BalanceUpdatedBlob> {
        let balance = *(balance_state.to_arcis());
        let blob = BalanceUpdatedBlob {
            amount: balance.amount,
            committed_amount: balance.committed_amount,
        };
        owner.from_arcis(blob)
    }

    /// Crank (settle) a deal after expiry or when fully filled.
    /// Updates creator's balance (release commitment, refund unfilled).
    /// Returns updated balance, settlement blob encrypted for the creator, balance blob, and the new status.
    #[instruction]
    pub fn crank_deal(
        deal_state: Enc<Mxe, &DealState>,
        creator_balance: Enc<Mxe, &BalanceState>,
        creator_deal_blob: Shared,
        creator_balance_blob: Shared,
        is_expired: bool,
        allow_partial: bool,
    ) -> (
        Enc<Mxe, BalanceState>,
        Enc<Shared, DealSettledBlob>,
        Enc<Shared, BalanceUpdatedBlob>,
        u8,
    ) {
        let deal = *(deal_state.to_arcis());
        let balance = *(creator_balance.to_arcis());
        let fully_filled = deal.fill_amount >= deal.amount;

        // can_settle: expired OR fully filled
        let can_settle = is_expired || fully_filled;

        // deal_executes: fully filled OR (partial allowed AND has some fill)
        let deal_executes = fully_filled || (allow_partial && deal.fill_amount > 0);

        // Compute values based on whether we can settle and whether deal executes
        let total_filled = if can_settle && deal_executes {
            deal.fill_amount
        } else {
            0
        };

        let unfilled = deal.amount - total_filled;

        // price is X64.64: (fill_amount * price) >> 64
        let creator_receives = ((total_filled as u128 * deal.price) >> 64) as u64;
        let creator_refund = if can_settle { unfilled } else { 0 };

        // Update creator's balance: release commitment and deduct sold BASE tokens
        let new_balance = if can_settle {
            BalanceState {
                amount: balance.amount - total_filled,  // Deduct sold BASE tokens
                committed_amount: balance.committed_amount - deal.amount,  // Release full commitment
            }
        } else {
            balance
        };

        let deal_blob = DealSettledBlob {
            total_filled,
            creator_receives,
            creator_refund,
        };

        let balance_blob = BalanceUpdatedBlob {
            amount: new_balance.amount,
            committed_amount: new_balance.committed_amount,
        };

        // status: 0 = OPEN (no change), 1 = EXECUTED, 2 = EXPIRED
        let status: u8 = if !can_settle {
            0 // Cannot settle yet
        } else if deal_executes {
            1 // EXECUTED
        } else {
            2 // EXPIRED
        };

        (
            creator_balance.owner.from_arcis(new_balance),
            creator_deal_blob.from_arcis(deal_blob),
            creator_balance_blob.from_arcis(balance_blob),
            status.reveal(),
        )
    }

    /// Crank (settle) a single offer after the deal has been settled.
    /// CRITICAL: Uses deal state to calculate quote amounts correctly.
    /// Updates offeror's balance: release commitment and refund unused QUOTE tokens.
    /// Returns updated balance, settlement blob encrypted for the offeror, and balance blob.
    #[instruction]
    pub fn crank_offer(
        deal_state: Enc<Mxe, &DealState>,
        offer_state: Enc<Mxe, &OfferState>,
        offeror_balance: Enc<Mxe, &BalanceState>,
        offeror_offer_blob: Shared,
        offeror_balance_blob: Shared,
        deal_success: bool,
    ) -> (
        Enc<Mxe, BalanceState>,
        Enc<Shared, OfferSettledBlob>,
        Enc<Shared, BalanceUpdatedBlob>,
    ) {
        let deal = *(deal_state.to_arcis());
        let offer = *(offer_state.to_arcis());
        let balance = *(offeror_balance.to_arcis());

        // If deal failed, nothing executes
        let executed_amt = if deal_success {
            offer.amt_to_execute
        } else {
            0
        };

        // Calculate quote amounts (X64.64 fixed-point)
        // quote_committed = offer.amount * offer.price (what was locked at submit_offer)
        // quote_executed = executed_amt * deal.price (actual payment at deal's price)
        // quote_refund = quote_committed - quote_executed (includes price spread savings)
        let quote_committed = ((offer.amount as u128 * offer.price) >> 64) as u64;
        let quote_executed = ((executed_amt as u128 * deal.price) >> 64) as u64;
        let quote_refund = quote_committed - quote_executed;

        // Update offeror's balance: release commitment and deduct paid QUOTE tokens
        let new_balance = BalanceState {
            amount: balance.amount - quote_executed,  // Deduct paid QUOTE tokens
            committed_amount: balance.committed_amount - quote_committed,  // Release full commitment
        };

        let outcome: u8 = if executed_amt == 0 {
            2  // FAILED
        } else if executed_amt < offer.amount {
            1  // PARTIAL
        } else {
            0  // EXECUTED (full)
        };

        let offer_blob = OfferSettledBlob {
            outcome,
            executed_amt,
            quote_paid: quote_executed,
            quote_refund,
        };

        let balance_blob = BalanceUpdatedBlob {
            amount: new_balance.amount,
            committed_amount: new_balance.committed_amount,
        };

        (
            offeror_balance.owner.from_arcis(new_balance),
            offeror_offer_blob.from_arcis(offer_blob),
            offeror_balance_blob.from_arcis(balance_blob),
        )
    }

    /// Initialize a new counter with value 0, encrypted for the MXE only.
    /// The state is stored on-chain and only the MXE can decrypt it.
    #[instruction]
    pub fn init_counter(mxe: Mxe) -> Enc<Mxe, CounterState> {
        let counter = CounterState { counter: 0 };
        mxe.from_arcis(counter)
    }

    /// Increment the counter. Takes MXE-encrypted state by reference,
    /// returns updated MXE-encrypted state.
    #[instruction]
    pub fn increment_counter(
        counter_ctxt: Enc<Mxe, &CounterState>,
    ) -> Enc<Mxe, CounterState> {
        let mut counter = *(counter_ctxt.to_arcis());
        counter.counter += 1;
        counter_ctxt.owner.from_arcis(counter)
    }

    /// Read the counter value and re-encrypt it for a specific user.
    /// This allows sharing the MXE-encrypted state with the outside world.
    /// Also takes the pubkey_hi and pubkey_lo as plaintext parameters to encrypt the counter for a specific user.
    #[instruction]
    pub fn get_counter(
        counter_ctxt: Enc<Mxe, &CounterState>,
        recipient: Shared,
        pubkey_hi: u128,
        pubkey_lo: u128,
    ) -> (Enc<Shared, CounterState>, Enc<Shared, CounterState>) {
        let counter = *(counter_ctxt.to_arcis());
        // Re-encrypt for the recipient so they can decrypt it

        let mut p = [0u8; 32];
        p[0..16].copy_from_slice(&pubkey_hi.to_le_bytes());
        p[16..32].copy_from_slice(&pubkey_lo.to_le_bytes());

        let pubkey = ArcisX25519Pubkey::from_uint8(&p);

        let shared_ctxt = Shared::new(pubkey);

        (recipient.from_arcis(counter), shared_ctxt.from_arcis(counter))
    }

    /// Top up a balance account.
    /// Takes existing MXE-encrypted balance state (by reference), owner marker for event blob,
    /// plaintext amount to add, and is_new flag to handle init_if_needed pattern.
    /// Returns updated MXE-encrypted state and Shared-encrypted blob for owner.
    #[instruction]
    pub fn top_up(
        balance_state: Enc<Mxe, &BalanceState>,
        owner: Shared,
        amount: u64,
        is_new: bool,
    ) -> (Enc<Mxe, BalanceState>, Enc<Shared, BalanceUpdatedBlob>) {
        let state = if is_new {
            BalanceState {
                amount: 0,
                committed_amount: 0,
            }
        } else {
            *(balance_state.to_arcis())
        };

        let new_state = BalanceState {
            amount: state.amount + amount,
            committed_amount: state.committed_amount,
        };

        let blob = BalanceUpdatedBlob {
            amount: new_state.amount,
            committed_amount: new_state.committed_amount,
        };

        (
            balance_state.owner.from_arcis(new_state),
            owner.from_arcis(blob),
        )
    }
}
