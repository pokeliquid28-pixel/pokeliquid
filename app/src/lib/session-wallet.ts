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
  icon =
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff6ec7"/><stop offset="33%" stop-color="#a78bfa"/><stop offset="66%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#34d399"/></linearGradient><clipPath id="d"><path d="M32 4C32 4 8 30 8 42A24 24 0 0056 42C56 30 32 4 32 4Z"/></clipPath></defs><path d="M32 4C32 4 8 30 8 42A24 24 0 0056 42C56 30 32 4 32 4Z" fill="url(#h)"/><path d="M32 10C32 10 13 32 13 42A19 19 0 0051 42C51 32 32 10 32 10Z" fill="#0a0a0f"/><g clip-path="url(#d)"><rect x="13" y="26" width="38" height="16" fill="#e53e3e"/><rect x="13" y="42" width="38" height="18" fill="#1a1a2e"/><rect x="13" y="40" width="38" height="4" fill="#2d2d44"/><circle cx="32" cy="42" r="7" fill="#2d2d44"/><circle cx="32" cy="42" r="5" fill="#0a0a0f"/><circle cx="32" cy="42" r="3" fill="url(#h)"/></g></svg>'
    );
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
      // Try loading from localStorage
      const stored = loadSessionKeypair();
      if (stored) {
        this._keypair = stored;
      } else {
        // Generate new keypair and request funding from API
        const kp = Keypair.generate();
        saveSessionKeypair(kp);
        this._keypair = kp;

        // Fire-and-forget: request funding
        try {
          const res = await fetch("/api/create-session-wallet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              publicKey: kp.publicKey.toBase58(),
              privateKey: JSON.stringify(Array.from(kp.secretKey)),
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.sessionId) {
              sessionStorage.setItem("pokeliquid_session_id", data.sessionId);
            }
          }
        } catch {
          // API not available — wallet still works, user can airdrop manually
        }
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
