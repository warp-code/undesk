"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { deriveKeys, DerivedKeys } from "../_lib/encryption";

export interface UseDerivedKeysReturn {
  /** The derived keys, or null if not yet derived */
  derivedKeys: DerivedKeys | null;
  /** Whether key derivation is in progress */
  isDerivingKeys: boolean;
  /** Function to trigger key derivation (prompts two wallet signatures). Returns the derived keys. */
  deriveKeysFromWallet: () => Promise<DerivedKeys>;
  /** Function to clear derived keys from memory */
  clearKeys: () => void;
  /** Convenience boolean: true if derivedKeys is not null */
  hasDerivedKeys: boolean;
}

/**
 * React hook for managing derived encryption keys.
 *
 * Derives deterministic keypairs from wallet signatures:
 * - Controller key (Ed25519): For signing transactions
 * - Encryption key (x25519): For Arcium encryption
 *
 * Keys are automatically cleared when wallet disconnects.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { derivedKeys, isDerivingKeys, deriveKeysFromWallet } = useDerivedKeys();
 *
 *   if (!derivedKeys) {
 *     return <button onClick={deriveKeysFromWallet} disabled={isDerivingKeys}>
 *       {isDerivingKeys ? "Signing..." : "Derive Keys"}
 *     </button>;
 *   }
 *
 *   return <div>Keys derived! Controller: {derivedKeys.controller.publicKey.toBase58()}</div>;
 * }
 * ```
 */
export function useDerivedKeys(): UseDerivedKeysReturn {
  const { publicKey, signMessage, connected } = useWallet();
  const [derivedKeys, setDerivedKeys] = useState<DerivedKeys | null>(null);
  const [isDerivingKeys, setIsDerivingKeys] = useState(false);

  // Auto-clear keys on wallet disconnect
  useEffect(() => {
    if (!connected) {
      setDerivedKeys(null);
    }
  }, [connected]);

  const deriveKeysFromWallet = useCallback(async (): Promise<DerivedKeys> => {
    if (!publicKey || !signMessage) {
      throw new Error("Wallet not connected or does not support signing");
    }

    setIsDerivingKeys(true);
    try {
      const keys = await deriveKeys(signMessage, publicKey);
      setDerivedKeys(keys);
      return keys;
    } finally {
      setIsDerivingKeys(false);
    }
  }, [publicKey, signMessage]);

  const clearKeys = useCallback(() => {
    setDerivedKeys(null);
  }, []);

  return {
    derivedKeys,
    isDerivingKeys,
    deriveKeysFromWallet,
    clearKeys,
    hasDerivedKeys: derivedKeys !== null,
  };
}
