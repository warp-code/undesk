import * as anchor from "@coral-xyz/anchor";
import { createMint, getMint } from "@solana/spl-token";
import { getTestHarness } from "./harness";
import { deriveMintKeypair, deriveMintAddresses, TOKEN_DECIMALS } from "./deterministic-mints";

/**
 * Creates deterministic test mints derived from the owner wallet.
 * These addresses can be independently computed by the frontend.
 */
export async function setupTestMints() {
  const { provider, owner } = getTestHarness();

  console.log("Setting up deterministic mints for wallet:", owner.publicKey.toBase58());

  const mints = deriveMintAddresses(owner.publicKey);
  console.log("Expected mint addresses:", mints);

  for (const [symbol, mintAddress] of Object.entries(mints)) {
    const mintKeypair = deriveMintKeypair(owner.publicKey, symbol);
    const decimals = TOKEN_DECIMALS[symbol] ?? 9;

    // Check if mint already exists
    try {
      await getMint(provider.connection, mintKeypair.publicKey);
      console.log(`${symbol} mint already exists:`, mintAddress);
      continue;
    } catch {
      // Mint doesn't exist, create it
    }

    await createMint(
      provider.connection,
      owner,
      owner.publicKey, // mint authority
      null, // freeze authority
      decimals,
      mintKeypair // use deterministic keypair
    );
    console.log(`${symbol} mint created:`, mintAddress);
  }

  return mints;
}
