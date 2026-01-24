-- OTC Platform Initial Schema
-- Generated from: vibes/datamodel/000-initial-draft.md

--------------------------------------------------------------------------------
-- TABLES
--------------------------------------------------------------------------------

-- Deals table: stores OTC deals created by users
CREATE TABLE deals (
  -- Primary key
  address TEXT PRIMARY KEY,              -- Deal pubkey (base58)

  -- Public metadata (from DealCreated event)
  base_mint TEXT NOT NULL,               -- Token being offered
  quote_mint TEXT NOT NULL,              -- Token accepted as payment
  expires_at TIMESTAMPTZ NOT NULL,       -- When deal expires
  allow_partial BOOLEAN NOT NULL,        -- Allow partial fills at expiry
  status TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'executed' | 'expired'
  created_at TIMESTAMPTZ NOT NULL,       -- Creation timestamp
  settled_at TIMESTAMPTZ,                -- Settlement timestamp (null until settled)

  -- Creation encrypted data (from DealCreated event)
  encryption_key BYTEA NOT NULL,         -- [u8; 32] creator's x25519 pubkey
  nonce BYTEA NOT NULL,                  -- [u8; 16] encryption nonce
  ciphertexts BYTEA NOT NULL,            -- [[u8; 32]; 2] = 64 bytes (amount, price)

  -- Settlement encrypted data (from DealSettled event, null until settled)
  settlement_encryption_key BYTEA,       -- [u8; 32] creator's x25519 pubkey (echoed)
  settlement_nonce BYTEA,                -- [u8; 16] encryption nonce
  settlement_ciphertexts BYTEA,          -- [[u8; 32]; 3] = 96 bytes (total_filled, receives, refund)

  -- Indexing metadata
  created_signature TEXT NOT NULL,       -- Transaction signature for DealCreated
  settled_signature TEXT,                -- Transaction signature for DealSettled
  slot BIGINT NOT NULL,                  -- Solana slot of last update
  indexed_at TIMESTAMPTZ DEFAULT NOW(),  -- When this row was indexed

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('open', 'executed', 'expired')),
  CONSTRAINT valid_encryption_key_length CHECK (octet_length(encryption_key) = 32),
  CONSTRAINT valid_nonce_length CHECK (octet_length(nonce) = 16),
  CONSTRAINT valid_ciphertexts_length CHECK (octet_length(ciphertexts) = 64),
  CONSTRAINT valid_settlement_encryption_key_length CHECK (
    settlement_encryption_key IS NULL OR octet_length(settlement_encryption_key) = 32
  ),
  CONSTRAINT valid_settlement_nonce_length CHECK (
    settlement_nonce IS NULL OR octet_length(settlement_nonce) = 16
  ),
  CONSTRAINT valid_settlement_ciphertexts_length CHECK (
    settlement_ciphertexts IS NULL OR octet_length(settlement_ciphertexts) = 96
  )
);

-- Offers table: stores offers submitted to deals
CREATE TABLE offers (
  -- Primary key
  address TEXT PRIMARY KEY,              -- Offer pubkey (base58)

  -- Relationships (no FK constraint - indexer may process events out of order)
  deal_address TEXT NOT NULL,

  -- Public metadata (from OfferCreated event)
  offer_index INT NOT NULL,              -- FIFO sequence number within deal
  status TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'settled'
  submitted_at TIMESTAMPTZ NOT NULL,     -- Submission timestamp
  settled_at TIMESTAMPTZ,                -- Settlement timestamp (null until settled)

  -- Creation encrypted data (from OfferCreated event)
  encryption_key BYTEA NOT NULL,         -- [u8; 32] offeror's x25519 pubkey
  nonce BYTEA NOT NULL,                  -- [u8; 16] encryption nonce
  ciphertexts BYTEA NOT NULL,            -- [[u8; 32]; 2] = 64 bytes (price, amount)

  -- Settlement encrypted data (from OfferSettled event, null until settled)
  settlement_encryption_key BYTEA,       -- [u8; 32] offeror's x25519 pubkey (echoed)
  settlement_nonce BYTEA,                -- [u8; 16] encryption nonce
  settlement_ciphertexts BYTEA,          -- [[u8; 32]; 3] = 96 bytes (outcome, executed_amt, refund_amt)

  -- Indexing metadata
  created_signature TEXT NOT NULL,       -- Transaction signature for OfferCreated
  settled_signature TEXT,                -- Transaction signature for OfferSettled
  slot BIGINT NOT NULL,                  -- Solana slot of last update
  indexed_at TIMESTAMPTZ DEFAULT NOW(),  -- When this row was indexed

  -- Constraints
  CONSTRAINT valid_offer_status CHECK (status IN ('open', 'settled')),
  CONSTRAINT valid_offer_encryption_key_length CHECK (octet_length(encryption_key) = 32),
  CONSTRAINT valid_offer_nonce_length CHECK (octet_length(nonce) = 16),
  CONSTRAINT valid_offer_ciphertexts_length CHECK (octet_length(ciphertexts) = 64),
  CONSTRAINT valid_offer_settlement_encryption_key_length CHECK (
    settlement_encryption_key IS NULL OR octet_length(settlement_encryption_key) = 32
  ),
  CONSTRAINT valid_offer_settlement_nonce_length CHECK (
    settlement_nonce IS NULL OR octet_length(settlement_nonce) = 16
  ),
  CONSTRAINT valid_offer_settlement_ciphertexts_length CHECK (
    settlement_ciphertexts IS NULL OR octet_length(settlement_ciphertexts) = 96
  )
);

-- Raw events table: optional audit trail for all indexed events
CREATE TABLE raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature TEXT NOT NULL,               -- Transaction signature
  slot BIGINT NOT NULL,                  -- Solana slot number
  block_time TIMESTAMPTZ,                -- Block timestamp
  event_name TEXT NOT NULL,              -- 'DealCreated' | 'DealSettled' | 'OfferCreated' | 'OfferSettled'
  raw_data BYTEA NOT NULL,               -- Raw event data (Borsh-encoded)
  indexed_at TIMESTAMPTZ DEFAULT NOW(),  -- When this event was indexed

  -- Prevent duplicate event indexing
  UNIQUE(signature, event_name)
);

--------------------------------------------------------------------------------
-- INDEXES
--------------------------------------------------------------------------------

-- Deals indexes
CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deals_mints ON deals(base_mint, quote_mint);
CREATE INDEX idx_deals_expires_at ON deals(expires_at);
CREATE INDEX idx_deals_encryption_key ON deals(encryption_key);  -- For "my deals" queries
CREATE INDEX idx_deals_created_at ON deals(created_at DESC);     -- For recent deals ordering

-- Offers indexes
CREATE INDEX idx_offers_deal ON offers(deal_address);
CREATE INDEX idx_offers_status ON offers(status);
CREATE INDEX idx_offers_encryption_key ON offers(encryption_key);  -- For "my offers" queries
CREATE INDEX idx_offers_submitted_at ON offers(submitted_at DESC); -- For recent offers ordering

-- Raw events indexes
CREATE INDEX idx_raw_events_slot ON raw_events(slot);
CREATE INDEX idx_raw_events_event_name ON raw_events(event_name);
CREATE INDEX idx_raw_events_signature ON raw_events(signature);

--------------------------------------------------------------------------------
-- REALTIME
--------------------------------------------------------------------------------

-- Enable Realtime for deals and offers tables
-- Frontend subscribes to these for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE deals;
ALTER PUBLICATION supabase_realtime ADD TABLE offers;

--------------------------------------------------------------------------------
-- COMMENTS (for documentation)
--------------------------------------------------------------------------------

COMMENT ON TABLE deals IS 'OTC deals created by users. Encrypted fields can only be decrypted by the deal creator.';
COMMENT ON TABLE offers IS 'Offers submitted to deals. Encrypted fields can only be decrypted by the offeror.';
COMMENT ON TABLE raw_events IS 'Audit trail of all indexed on-chain events.';

COMMENT ON COLUMN deals.encryption_key IS 'Creator x25519 public key. Use with bytesToHex() for queries.';
COMMENT ON COLUMN deals.ciphertexts IS 'Encrypted [amount: u64, price: u128]. 64 bytes total.';
COMMENT ON COLUMN deals.settlement_ciphertexts IS 'Encrypted [total_filled: u64, creator_receives: u64, creator_refund: u64]. 96 bytes total.';

COMMENT ON COLUMN offers.encryption_key IS 'Offeror x25519 public key. Use with bytesToHex() for queries.';
COMMENT ON COLUMN offers.ciphertexts IS 'Encrypted [price: u128, amount: u64]. 64 bytes total.';
COMMENT ON COLUMN offers.settlement_ciphertexts IS 'Encrypted [outcome: u8, executed_amt: u64, refund_amt: u64]. 96 bytes total.';
