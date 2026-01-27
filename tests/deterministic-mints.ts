import { Keypair, PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";

/**
 * Derives a deterministic keypair for a mint based on a wallet and token symbol.
 * Both tests and frontend can derive the same addresses independently.
 */
export function deriveMintKeypair(
  walletPubkey: PublicKey,
  symbol: string
): Keypair {
  const seed = sha256(
    Buffer.concat([
      walletPubkey.toBuffer(),
      Buffer.from(`otc:mint:${symbol}`),
    ])
  );
  return Keypair.fromSeed(seed);
}

/**
 * Derives deterministic mint addresses for all supported tokens.
 */
export function deriveMintAddresses(walletPubkey: PublicKey): Record<string, string> {
  const symbols = ["META", "USDC", "ETH", "SOL"];
  const mints: Record<string, string> = {};

  for (const symbol of symbols) {
    const keypair = deriveMintKeypair(walletPubkey, symbol);
    mints[symbol] = keypair.publicKey.toBase58();
  }

  return mints;
}

/**
 * Token decimals for each symbol.
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  META: 9,
  USDC: 6,
  ETH: 8,
  SOL: 9,
};
