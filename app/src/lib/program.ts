import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider, Program } from "@anchor-lang/core";
import IDL from "./pokeliquid.idl.json";

// Minimal wallet type compatible with AnchorProvider
export type AnchorCompatibleWallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

// Read-only wallet for fetching accounts without a connected wallet
class ReadOnlyWallet implements AnchorCompatibleWallet {
  readonly publicKey = PublicKey.default;
  async signTransaction<T>(tx: T): Promise<T> {
    throw new Error("Read-only wallet cannot sign");
  }
  async signAllTransactions<T>(txs: T[]): Promise<T[]> {
    throw new Error("Read-only wallet cannot sign");
  }
}

export function getReadonlyProgram(connection: Connection) {
  const wallet = new ReadOnlyWallet();
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
  return new Program(IDL as any, provider);
}

export function getProgram(connection: Connection, wallet: AnchorCompatibleWallet) {
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return new Program(IDL as any, provider);
}

export type PokeliquidProgram = ReturnType<typeof getProgram>;
