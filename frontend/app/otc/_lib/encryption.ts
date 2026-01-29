import { sha256 } from "@noble/hashes/sha256";
import { x25519, RescueCipher, deserializeLE } from "@arcium-hq/client";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// Message prefixes for deterministic key derivation
const CONTROLLER_MESSAGE = "otc:controller:v1";
const ENCRYPTION_MESSAGE = "otc:encryption:v1";

/**
 * Derived keys from wallet signature
 */
export interface DerivedKeys {
  /** Ed25519 keypair for signing transactions (controller) */
  controller: Keypair;
  /** x25519 keys for Arcium encryption */
  encryption: {
    privateKey: Uint8Array; // 32 bytes
    publicKey: Uint8Array; // 32 bytes
  };
}

/**
 * Derives deterministic keypairs from wallet signatures.
 * Signs two messages to derive controller (Ed25519) and encryption (x25519) keys.
 *
 * @param signMessage - Wallet's signMessage function
 * @param walletPubkey - The connected wallet's public key
 * @returns DerivedKeys containing controller keypair and encryption keys
 */
export async function deriveKeys(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  walletPubkey: PublicKey
): Promise<DerivedKeys> {
  // 1. Sign controller message
  const controllerMsg = `${CONTROLLER_MESSAGE}\nWallet: ${walletPubkey.toBase58()}`;
  const controllerSig = await signMessage(
    new TextEncoder().encode(controllerMsg)
  );
  const controllerSeed = sha256(controllerSig);
  const controller = Keypair.fromSeed(controllerSeed);

  // 2. Sign encryption message
  const encryptionMsg = `${ENCRYPTION_MESSAGE}\nWallet: ${walletPubkey.toBase58()}`;
  const encryptionSig = await signMessage(
    new TextEncoder().encode(encryptionMsg)
  );
  const encryptionSeed = sha256(encryptionSig);
  const encryptionPublicKey = x25519.getPublicKey(encryptionSeed);

  return {
    controller,
    encryption: {
      privateKey: encryptionSeed,
      publicKey: encryptionPublicKey,
    },
  };
}

/**
 * Creates a RescueCipher using x25519 key exchange with the MXE.
 *
 * @param privateKey - Your x25519 private key (32 bytes)
 * @param mxePublicKey - The MXE's x25519 public key (32 bytes)
 * @returns RescueCipher instance for encryption/decryption
 */
export function createCipher(
  privateKey: Uint8Array,
  mxePublicKey: Uint8Array
): RescueCipher {
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  return new RescueCipher(sharedSecret);
}

/**
 * Encrypts deal input for Arcium computation.
 * DealInput struct order: { amount: u64, price: u128 }
 *
 * @param cipher - RescueCipher instance
 * @param amount - Base asset amount (u64)
 * @param price - X64.64 fixed-point price (u128)
 * @param nonce - 16-byte nonce
 * @returns Array of ciphertexts [encryptedAmount, encryptedPrice]
 */
export function encryptDealInput(
  cipher: RescueCipher,
  amount: bigint,
  price: bigint,
  nonce: Uint8Array
): number[][] {
  // DealInput: amount (u64) first, then price (u128)
  const plaintext = [amount, price];
  return cipher.encrypt(plaintext, nonce);
}

/**
 * Encrypts offer input for Arcium computation.
 * OfferInput struct order: { price: u128, amount: u64 }
 *
 * @param cipher - RescueCipher instance
 * @param price - X64.64 fixed-point price (u128)
 * @param amount - Base asset amount (u64)
 * @param nonce - 16-byte nonce
 * @returns Array of ciphertexts [encryptedPrice, encryptedAmount]
 */
export function encryptOfferInput(
  cipher: RescueCipher,
  price: bigint,
  amount: bigint,
  nonce: Uint8Array
): number[][] {
  // OfferInput: price (u128) first, then amount (u64)
  const plaintext = [price, amount];
  return cipher.encrypt(plaintext, nonce);
}

/**
 * Converts a decimal price to X64.64 fixed-point format.
 * X64.64: 128-bit number where upper 64 bits = integer, lower 64 bits = fraction.
 *
 * @param price - Decimal price (e.g., 2.5)
 * @returns X64.64 bigint representation
 *
 * @example
 * toX64Price(2.0)  // Returns 2n << 64n
 * toX64Price(2.5)  // Returns (2n << 64n) + (1n << 63n)
 */
export function toX64Price(price: number): bigint {
  // Use string manipulation to avoid JS Number precision limits (max safe int is 2^53)
  // Convert to fixed-point string with enough decimal places
  const DECIMAL_PRECISION = 18; // More than enough for most prices
  const priceStr = price.toFixed(DECIMAL_PRECISION);
  const [wholeStr, fracStr = ""] = priceStr.split(".");

  const wholePart = BigInt(wholeStr);

  // Convert fractional part: frac * 2^64 / 10^DECIMAL_PRECISION
  // Use bigint arithmetic to maintain precision
  const fracNumerator = BigInt(fracStr.padEnd(DECIMAL_PRECISION, "0"));
  const fracDenominator = BigInt(10) ** BigInt(DECIMAL_PRECISION);
  const scale = BigInt(1) << BigInt(64); // 2^64

  // fractionalPart = (fracNumerator * 2^64) / 10^DECIMAL_PRECISION
  const fractionalPart = (fracNumerator * scale) / fracDenominator;

  return (wholePart << BigInt(64)) + fractionalPart;
}

/**
 * Converts X64.64 fixed-point to decimal price.
 *
 * @param x64Price - X64.64 bigint representation
 * @returns Decimal price
 *
 * @example
 * fromX64Price(2n << 64n)  // Returns 2.0
 */
export function fromX64Price(x64Price: bigint): number {
  const scale = BigInt(2) ** BigInt(64);
  // Convert to number after division to preserve precision
  return Number(x64Price) / Number(scale);
}

/**
 * Generates a cryptographically secure 16-byte nonce.
 *
 * @returns 16-byte Uint8Array nonce
 */
export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  return nonce;
}

/**
 * Converts a 16-byte nonce to BN for Anchor transactions.
 * Uses little-endian deserialization.
 *
 * @param nonce - 16-byte Uint8Array nonce
 * @returns BN representation for use in Anchor instructions
 */
export function nonceToU128(nonce: Uint8Array): BN {
  return new BN(deserializeLE(nonce).toString());
}

// Re-export for convenience
export { RescueCipher, x25519, deserializeLE };
