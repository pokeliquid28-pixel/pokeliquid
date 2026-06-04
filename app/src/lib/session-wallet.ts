import {
  BaseSignerWalletAdapter,
  WalletName,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";

const STORAGE_KEY = "pokeliquid_session_wallet";
const EMAIL_KEY = "pokeliquid_wallet_email";

export const SessionWalletName = "Pokeliquid Wallet" as WalletName<"Pokeliquid Wallet">;

export class SessionWalletAdapter extends BaseSignerWalletAdapter {
  name = SessionWalletName;
  url = "https://pokeliquid.xyz";
  icon = "/logo-64.png";
  supportedTransactionVersions = null;

  private _keypair: Keypair | null = null;
  private _connecting = false;

  get readyState(): WalletReadyState {
    if (typeof window === "undefined") return WalletReadyState.Unsupported;
    return WalletReadyState.Loadable;
  }

  get publicKey() {
    return this._keypair?.publicKey ?? null;
  }

  get connecting() {
    return this._connecting;
  }

  async connect(): Promise<void> {
    if (this._keypair) return;
    this._connecting = true;

    try {
      // Try loading from localStorage — do NOT generate a new keypair on connect.
      // New keypairs are only created explicitly via guest mode or signup.
      const stored = loadSessionKeypair();
      if (stored) {
        this._keypair = stored;
      } else {
        this._connecting = false;
        return; // No wallet — user must log in or choose guest mode
      }

      this.emit("connect", this._keypair.publicKey);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._keypair = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> {
    if (!this._keypair) throw new Error("Wallet not connected");

    if (transaction instanceof Transaction) {
      transaction.partialSign(this._keypair);
    } else {
      transaction.sign([this._keypair]);
    }
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    for (const tx of transactions) {
      await this.signTransaction(tx);
    }
    return transactions;
  }
}

// ── localStorage helpers ────────────────────────────────────────────────────

export function loadSessionKeypair(): Keypair | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(new Uint8Array(arr));
  } catch {
    return null;
  }
}

export function saveSessionKeypair(kp: Keypair) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Array.from(kp.secretKey))
  );
}

export function getSessionPrivateKey(): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSessionFromPrivateKey(secretKey: number[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(secretKey));
}

export function getSavedEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(EMAIL_KEY);
}

export function setSavedEmail(email: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EMAIL_KEY, email);
}

export function hasSessionWallet(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function clearSessionWallet() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem("pokeliquid_session_id");
}

/** Create a new guest keypair, save to localStorage, and request funding. */
export async function createGuestWallet(): Promise<void> {
  const kp = Keypair.generate();
  saveSessionKeypair(kp);
  try {
    await fetch("/api/create-session-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: kp.publicKey.toBase58(),
        privateKey: JSON.stringify(Array.from(kp.secretKey)),
      }),
    });
  } catch { /* funding optional */ }
}
