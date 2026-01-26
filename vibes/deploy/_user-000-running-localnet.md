All commands assume we're starting from the root dir.

```sh
# Spin up solana validator
solana-test-validator --reset

# Spin up arcium localnet
arcium localnet

# Run the indexer
cd ./packages/indexer
yarn start

# Run the cranker
cd ./packages/cranker
yarn start

# Run tests to fill a bit of data - doesn't need to return success
ARCIUM_CLUSTER_OFFSET= anchor test --skip-build --skip-deploy --skip-local-validator  

# Ensure supabase is up and running
supabase start

# Run website
yarn dev
```