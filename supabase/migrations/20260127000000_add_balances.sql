-- Balance Accounts Migration
-- Adds support for encrypted user balance tracking

--------------------------------------------------------------------------------
-- TABLE
--------------------------------------------------------------------------------

CREATE TABLE balances (
  -- Primary key
  address TEXT PRIMARY KEY,                -- Balance account pubkey (base58)

  -- Public metadata (from BalanceUpdated event)
  controller TEXT NOT NULL,                -- Controller pubkey (signing authority)
  mint TEXT NOT NULL,                      -- Token mint for this balance

  -- Encrypted data (from BalanceUpdated event)
  encryption_key BYTEA NOT NULL,           -- [u8; 32] owner's x25519 pubkey
  nonce BYTEA NOT NULL,                    -- [u8; 16] encryption nonce
  ciphertexts BYTEA NOT NULL,              -- [[u8; 32]; 2] = 64 bytes (amount, committed_amount)

  -- Indexing metadata
  last_signature TEXT NOT NULL,            -- Transaction signature of last update
  slot BIGINT NOT NULL,                    -- Solana slot of last update
  indexed_at TIMESTAMPTZ DEFAULT NOW(),    -- When this row was indexed

  -- Constraints
  UNIQUE(controller, mint),                -- One balance per controller per mint
  CONSTRAINT valid_balance_encryption_key_length CHECK (octet_length(encryption_key) = 32),
  CONSTRAINT valid_balance_nonce_length CHECK (octet_length(nonce) = 16),
  CONSTRAINT valid_balance_ciphertexts_length CHECK (octet_length(ciphertexts) = 64)
);

--------------------------------------------------------------------------------
-- INDEXES
--------------------------------------------------------------------------------

CREATE INDEX idx_balances_controller ON balances(controller);
CREATE INDEX idx_balances_mint ON balances(mint);
CREATE INDEX idx_balances_encryption_key ON balances(encryption_key);  -- For "my balances" queries

--------------------------------------------------------------------------------
-- REALTIME
--------------------------------------------------------------------------------

-- Enable Realtime for balances table
-- Frontend subscribes for live balance updates
ALTER PUBLICATION supabase_realtime ADD TABLE balances;

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--------------------------------------------------------------------------------

ALTER TABLE balances ENABLE ROW LEVEL SECURITY;

-- Public read access (everyone can see balances, but only owner can decrypt)
CREATE POLICY "balances_select_public" ON balances
  FOR SELECT TO anon, authenticated USING (true);

--------------------------------------------------------------------------------
-- COMMENTS
--------------------------------------------------------------------------------

COMMENT ON TABLE balances IS 'User balance accounts. Encrypted fields can only be decrypted by the balance owner.';
COMMENT ON COLUMN balances.encryption_key IS 'Owner x25519 public key. Use with bytesToHex() for queries.';
COMMENT ON COLUMN balances.ciphertexts IS 'Encrypted [amount: u64, committed_amount: u64]. 64 bytes total.';
