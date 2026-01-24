use anchor_lang::prelude::*;

/// Emitted when a new deal is created.
/// Contains public metadata for indexing and an encrypted blob
/// decryptable only by the deal creator.
#[event]
pub struct DealCreated {
    // Public metadata (for indexing)
    pub deal: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub expires_at: i64,
    pub allow_partial: bool,
    pub created_at: i64,

    // Encrypted blob (decryptable by creator)
    /// The x25519 public key used for encryption (echoed back)
    pub encryption_key: [u8; 32],
    /// Nonce used for encryption
    pub nonce: [u8; 16],
    /// Encrypted DealCreatedBlob: amount (u64), price (u128)
    pub ciphertexts: [[u8; 32]; 2],
}

/// Emitted when a new offer is submitted to a deal.
/// Contains public metadata and an encrypted blob
/// decryptable only by the offeror.
#[event]
pub struct OfferCreated {
    pub deal: Pubkey,
    pub offer: Pubkey,
    pub offer_index: u32,
    pub submitted_at: i64,

    // Encrypted blob (decryptable by offeror)
    /// The x25519 public key used for encryption (echoed back)
    pub encryption_key: [u8; 32],
    /// Nonce used for encryption
    pub nonce: [u8; 16],
    /// Encrypted OfferCreatedBlob: price (u128), amount (u64)
    pub ciphertexts: [[u8; 32]; 2],
}

/// Emitted when a deal is settled (executed or expired).
/// Contains the final status and an encrypted blob
/// decryptable only by the deal creator.
#[event]
pub struct DealSettled {
    pub deal: Pubkey,
    pub status: u8,
    pub settled_at: i64,

    // Encrypted blob (decryptable by creator)
    /// The x25519 public key used for encryption (echoed back)
    pub encryption_key: [u8; 32],
    /// Nonce used for encryption
    pub nonce: [u8; 16],
    /// Encrypted DealSettledBlob: total_filled (u64), creator_receives (u64), creator_refund (u64)
    pub ciphertexts: [[u8; 32]; 3],
}

/// Emitted when an offer is settled.
/// Contains the outcome and an encrypted blob
/// decryptable only by the offeror.
#[event]
pub struct OfferSettled {
    pub deal: Pubkey,
    pub offer: Pubkey,
    pub offer_index: u32,

    // Encrypted blob (decryptable by offeror)
    /// The x25519 public key used for encryption (echoed back)
    pub encryption_key: [u8; 32],
    /// Nonce used for encryption
    pub nonce: [u8; 16],
    /// Encrypted OfferSettledBlob: outcome (u8), executed_amt (u64), refund_amt (u64)
    pub ciphertexts: [[u8; 32]; 3],
}
