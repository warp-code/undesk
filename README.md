# Undesk

Private peer-to-peer OTC trading on Solana, powered by Arcium confidential computing.

## What It Does

Undesk enables encrypted over-the-counter trades where prices and amounts remain private until settlement. Upon settlement, deal creators see their fills, while offerors see what they received and got refunded. The public never sees anything. Orders are matched using secure multi-party computation (MPC) on the Arcium network—no front-running, no slippage, no information leakage.

## Project Structure

```
undesk/
├── programs/otc/        # Solana smart contract (Anchor)
├── encrypted-ixs/       # Confidential computing instructions (Arcis)
├── packages/
│   ├── indexer/         # Event indexer (Supabase)
│   ├── cranker/         # Computation processor
│   └── supabase/        # Shared database client
└── frontend/            # Web trading interface (Next.js)
```

## Components

### programs/otc

Solana smart contract built with Anchor. Handles on-chain operations and stores encrypted data.

**Instructions:** `create_deal`, `submit_offer`, `crank_deal`, `crank_offer`, `top_up`, `announce_balance`

**Accounts:** `DealAccount`, `OfferAccount`, `BalanceAccount`, `Counter`

**Events:** `DealCreated`, `OfferCreated`, `DealSettled`, `OfferSettled`, `BalanceUpdated`

### encrypted-ixs

Confidential computing instructions that execute on the Arcium MPC network. Written using the Arcis framework.

**Instructions:** `create_deal`, `submit_offer`, `crank_deal`, `crank_offer`, `top_up`, `announce_balance`

### packages/indexer

Indexes Solana program events and stores them in Supabase for querying.

```bash
yarn workspace @otc/indexer start     # Run indexer
yarn workspace @otc/indexer backfill  # Backfill historical events
```

### packages/cranker

Permissionless cranker that processes completed deals and offers and invokes the Solana program's relevant cranks.

```bash
yarn workspace @otc/cranker start     # Run cranker
```

### packages/supabase

Shared Supabase database client used by the indexer and cranker.

### frontend

Next.js web application for trading.

**Pages:**
- `/` — Landing page
- `/otc` — Trading interface

**Currently only trades using test tokens, masked as:** SOL, USDC, JTO, META

```bash
yarn dev  # Start development server
```

## Development

```bash
# Build programs
arcium build

# Run tests (kill validator first for clean state)
./kill-validator.sh && arcium test

# Start frontend
yarn dev
```

See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines.

## Local environment (DEMO)

You can spin up a fully functioning local environment with a single command.
You can have up to 4 wallets pre-funded with SOL, see `LOCALNET_WALLET` env variables in `local.sh`.

```bash
# Run local environment
./local.sh
```

## License

[Business Source License 1.1](./LICENSE.md)
