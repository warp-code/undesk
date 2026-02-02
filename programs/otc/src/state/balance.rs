use anchor_lang::prelude::*;

// BalanceAccount data layout (after 8-byte discriminator):
// MXE-encrypted fields FIRST for stable offsets:
//   nonce: [u8; 16] at offset 8
//   ciphertexts: [[u8; 32]; 2] at offset 24
// Then plaintext fields follow.
// BalanceState has 2 fields: amount (u64), committed_amount (u64)
// For account references, we pass just the ciphertext portion
pub const BALANCE_CIPHERTEXT_OFFSET: u32 = 24; // discriminator (8) + nonce (16)
pub const BALANCE_CIPHERTEXT_LENGTH: u32 = 64; // 2 x 32 bytes

/// BalanceAccount represents a user's encrypted balance for a specific mint.
///
/// PDA seeds: ["balance", controller, mint]
#[account]
#[derive(InitSpace)]
pub struct BalanceAccount {
    // === MXE-encrypted (raw bytes) - MUST BE FIRST for stable offsets ===
    /// Nonce for MXE encryption
    pub nonce: [u8; 16],
    /// 2 encrypted fields: amount (u64), committed_amount (u64)
    pub ciphertexts: [[u8; 32]; 2],

    // === Public (plaintext) ===
    /// Derived ed25519 pubkey (signing authority)
    pub controller: Pubkey,
    /// Derived x25519 pubkey (for event routing/encryption)
    pub encryption_pubkey: [u8; 32],
    /// Token mint for this balance
    pub mint: Pubkey,
    /// PDA bump seed
    pub bump: u8,
}
