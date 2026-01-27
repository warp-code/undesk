import { sha256 } from "@noble/hashes/sha256";
import { Keypair, PublicKey } from "@solana/web3.js";

/**
 * The localnet mint authority wallet (from ~/.config/solana/id.json).
 * Override via NEXT_PUBLIC_MINT_AUTHORITY env var for other environments.
 */
const LOCALNET_MINT_AUTHORITY = "2SG7fCnreQ9wHoqQC7U6pfDN2rYmBqExKuqcGR3StrZW";

export const MINT_AUTHORITY = new PublicKey(
  process.env.NEXT_PUBLIC_MINT_AUTHORITY || LOCALNET_MINT_AUTHORITY
);

/**
 * Derives a deterministic mint public key based on a wallet and token symbol.
 * Uses the same algorithm as the test setup, so addresses match.
 */
export function deriveMintAddress(
  walletPubkey: PublicKey,
  symbol: string
): PublicKey {
  const seed = sha256(
    new Uint8Array([
      ...walletPubkey.toBytes(),
      ...new TextEncoder().encode(`otc:mint:${symbol}`),
    ])
  );
  // Use the same derivation as tests: Keypair.fromSeed(seed).publicKey
  return Keypair.fromSeed(seed).publicKey;
}

/**
 * Derives deterministic mint addresses for all supported tokens.
 */
export function deriveMintAddresses(
  walletPubkey: PublicKey = MINT_AUTHORITY
): Record<string, string> {
  const symbols = ["META", "USDC", "ETH", "SOL"];
  const mints: Record<string, string> = {};

  for (const symbol of symbols) {
    mints[symbol] = deriveMintAddress(walletPubkey, symbol).toBase58();
  }

  return mints;
}

// Pre-compute the localnet mint addresses
export const LOCALNET_MINTS = deriveMintAddresses(MINT_AUTHORITY);
