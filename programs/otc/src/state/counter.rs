use anchor_lang::prelude::*;

// Counter account data layout (after 8-byte discriminator):
// - nonce: [u8; 16] at offset 8
// - state: [[u8; 32]; 1] at offset 24
// CounterState has 1 field: counter (u64)
// For account references, we pass just the ciphertext portion
pub(crate) const COUNTER_CIPHERTEXT_OFFSET: u32 = 24; // Skip discriminator (8) + nonce (16)
pub(crate) const COUNTER_CIPHERTEXT_LENGTH: u32 = 32; // 1 x 32 bytes

/// Counter account stores MXE-encrypted state.
/// Layout matches MXEEncryptedStruct: nonce first, then ciphertexts.
#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub nonce: [u8; 16],
    pub state: [[u8; 32]; 1],
}
