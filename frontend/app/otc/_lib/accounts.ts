import { PublicKey } from "@solana/web3.js";

/** Derive deal PDA: ["deal", createKey] */
export function getDealAddress(
  programId: PublicKey,
  createKey: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), createKey.toBuffer()],
    programId
  )[0];
}

/** Derive offer PDA: ["offer", deal, createKey] */
export function getOfferAddress(
  programId: PublicKey,
  deal: PublicKey,
  createKey: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("offer"), deal.toBuffer(), createKey.toBuffer()],
    programId
  )[0];
}

/** Derive balance PDA: ["balance", controller, mint] */
export function getBalanceAddress(
  programId: PublicKey,
  controller: PublicKey,
  mint: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), controller.toBuffer(), mint.toBuffer()],
    programId
  )[0];
}
