use anchor_lang::prelude::*;

// DealAccount data layout (after 8-byte discriminator):
// Plaintext fields first:
//   create_key (32) + controller (32) + encryption_pubkey (32) +
//   base_mint (32) + quote_mint (32) + created_at (8) + expires_at (8) +
//   status (1) + allow_partial (1) + num_offers (4) + bump (1) = 183 bytes
// Then MXE-encrypted fields:
//   nonce: [u8; 16] at offset 8 + 183 = 191
//   ciphertexts: [[u8; 32]; 3] at offset 191 + 16 = 207
// DealState has 3 fields: amount (u64), price (u128), fill_amount (u64)
// For account references, we pass just the ciphertext portion
pub const DEAL_CIPHERTEXT_OFFSET: u32 = 207; // Skip discriminator (8) + plaintext fields (183) + nonce (16)
pub const DEAL_CIPHERTEXT_LENGTH: u32 = 96;  // 3 x 32 bytes

/// DealAccount represents an OTC deal created by a seller.
///
/// PDA seeds: ["deal", create_key]
#[account]
#[derive(InitSpace)]
pub struct DealAccount {
    // === Public (plaintext) ===
    /// Ephemeral signer used for PDA uniqueness
    pub create_key: Pubkey,
    /// Derived ed25519 pubkey (signing authority)
    pub controller: Pubkey,
    /// Derived x25519 pubkey (for event routing/encryption)
    pub encryption_pubkey: [u8; 32],
    /// Token the creator is selling (base asset)
    pub base_mint: Pubkey,
    /// Token the creator receives (quote asset)
    pub quote_mint: Pubkey,
    /// Unix timestamp when deal was created (set at callback)
    pub created_at: i64,
    /// Unix timestamp when deal expires
    pub expires_at: i64,
    /// Deal status (see DealStatus)
    pub status: u8,
    /// Whether to allow partial fills at expiry
    pub allow_partial: bool,
    /// Counter for offers made on this deal
    pub num_offers: u32,
    /// PDA bump seed
    pub bump: u8,

    // === MXE-encrypted (raw bytes) ===
    /// Nonce for MXE encryption
    pub nonce: [u8; 16],
    /// 3 encrypted fields: amount (u64), price (u128), fill_amount (u64)
    pub ciphertexts: [[u8; 32]; 3],
}
