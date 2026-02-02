"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const { connected } = useWallet();

  // Only show "Connect" when not connected; when connected, default behavior shows address
  return (
    <WalletMultiButton>{connected ? undefined : "Connect"}</WalletMultiButton>
  );
}
