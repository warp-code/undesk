import { RescueCipher, x25519 } from "@arcium-hq/client";
import { fromX64Price } from "./encryption";

// --- Hex/Bytes Conversion ---

/**
 * Converts a hex string to Uint8Array.
 * Handles PostgreSQL bytea format (\xABCD...).
 */
export function hexToBytes(hex: string): Uint8Array {
  // Handle PostgreSQL bytea format: \xABCD...
  const cleanHex = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Ownership Check ---

/**
 * Checks if an encryption key matches the user's public key.
 */
export function isOwnedByUser(
  encryptionKeyHex: string,
  userPublicKey: Uint8Array
): boolean {
  const encryptionKey = hexToBytes(encryptionKeyHex);
  if (encryptionKey.length !== userPublicKey.length) return false;
  return encryptionKey.every((byte, i) => byte === userPublicKey[i]);
}

// --- Cipher Creation ---

/**
 * Creates a RescueCipher for decryption using x25519 key exchange.
 *
 * @param userPrivateKey - Your x25519 private key (32 bytes)
 * @param mxePublicKey - The MXE's x25519 public key (32 bytes)
 * @returns RescueCipher instance for decryption
 */
export function createDecryptionCipher(
  userPrivateKey: Uint8Array,
  mxePublicKey: Uint8Array
): RescueCipher {
  const sharedSecret = x25519.getSharedSecret(userPrivateKey, mxePublicKey);
  return new RescueCipher(sharedSecret);
}

// --- Ciphertext Parsing ---

/**
 * Converts flattened bytea hex to number[][] format for RescueCipher.
 * Each ciphertext field is 32 bytes.
 */
function parseCiphertexts(hex: string, fieldCount: number): number[][] {
  const bytes = hexToBytes(hex);
  const result: number[][] = [];
  for (let i = 0; i < fieldCount; i++) {
    result.push(Array.from(bytes.slice(i * 32, (i + 1) * 32)));
  }
  return result;
}

// --- Decryption Functions ---

export interface DecryptedDealData {
  amount: number; // In base token units (not adjusted for decimals)
  price: number; // Decimal price (converted from X64.64)
}

/**
 * Decrypts deal data from database ciphertexts.
 * Field order: [amount (u64), price (u128)]
 */
export function decryptDealData(
  ciphertextsHex: string,
  nonceHex: string,
  cipher: RescueCipher
): DecryptedDealData {
  const ciphertexts = parseCiphertexts(ciphertextsHex, 2);
  const nonce = hexToBytes(nonceHex);

  const decrypted = cipher.decrypt(ciphertexts, nonce);
  // Field order: [amount (u64), price (u128)]

  return {
    amount: Number(decrypted[0]),
    price: fromX64Price(decrypted[1]),
  };
}

export interface DecryptedOfferData {
  price: number; // Decimal price
  amount: number; // In base token units
}

/**
 * Decrypts offer data from database ciphertexts.
 * Field order: [price (u128), amount (u64)]
 */
export function decryptOfferData(
  ciphertextsHex: string,
  nonceHex: string,
  cipher: RescueCipher
): DecryptedOfferData {
  const ciphertexts = parseCiphertexts(ciphertextsHex, 2);
  const nonce = hexToBytes(nonceHex);

  const decrypted = cipher.decrypt(ciphertexts, nonce);
  // Field order: [price (u128), amount (u64)]

  return {
    price: fromX64Price(decrypted[0]),
    amount: Number(decrypted[1]),
  };
}

export interface DecryptedOfferSettlement {
  outcome: number; // 0=EXECUTED, 1=PARTIAL, 2=FAILED
  executedAmt: bigint;
  quotePaid: bigint;
  quoteRefund: bigint;
}

/**
 * Decrypts offer settlement data from database ciphertexts.
 * Field order: [outcome (u8), executed_amt (u64), quote_paid (u64), quote_refund (u64)]
 */
export function decryptOfferSettlementData(
  ciphertextsHex: string,
  nonceHex: string,
  cipher: RescueCipher
): DecryptedOfferSettlement {
  const ciphertexts = parseCiphertexts(ciphertextsHex, 4);
  const nonce = hexToBytes(nonceHex);
  const decrypted = cipher.decrypt(ciphertexts, nonce);

  return {
    outcome: Number(decrypted[0]),
    executedAmt: decrypted[1],
    quotePaid: decrypted[2],
    quoteRefund: decrypted[3],
  };
}

export interface DecryptedDealSettlement {
  totalFilled: bigint; // Total amount filled across all offers (base token, raw)
  creatorReceives: bigint; // Quote tokens the creator receives
  creatorRefund: bigint; // Base tokens refunded to creator (unfilled)
}

/**
 * Decrypts deal settlement data from database ciphertexts.
 * Field order: [total_filled (u64), creator_receives (u64), creator_refund (u64)]
 */
export function decryptDealSettlementData(
  ciphertextsHex: string,
  nonceHex: string,
  cipher: RescueCipher
): DecryptedDealSettlement {
  const ciphertexts = parseCiphertexts(ciphertextsHex, 3);
  const nonce = hexToBytes(nonceHex);
  const decrypted = cipher.decrypt(ciphertexts, nonce);

  return {
    totalFilled: decrypted[0],
    creatorReceives: decrypted[1],
    creatorRefund: decrypted[2],
  };
}

export interface DecryptedBalanceData {
  amount: bigint; // Available balance amount
  committedAmount: bigint; // Amount committed to open deals/offers
}

/**
 * Decrypts balance data from database ciphertexts.
 * Field order: [amount (u64), committed_amount (u64)]
 */
export function decryptBalanceData(
  ciphertextsHex: string,
  nonceHex: string,
  cipher: RescueCipher
): DecryptedBalanceData {
  const ciphertexts = parseCiphertexts(ciphertextsHex, 2);
  const nonce = hexToBytes(nonceHex);
  const decrypted = cipher.decrypt(ciphertexts, nonce);

  return {
    amount: decrypted[0],
    committedAmount: decrypted[1],
  };
}
