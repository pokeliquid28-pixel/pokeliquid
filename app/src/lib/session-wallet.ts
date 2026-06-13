import {
  BaseSignerWalletAdapter,
  WalletName,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  isSecureStorageAvailable,
  storeSecretKey,
  hasStoredKey,
  loadPublicKeyBytes,
  signWithStoredKey,
  exportSecretKey,
  clearStoredKey,
  migrateFromLocalStorage,
  confirmMigration,
  recoverFromLocalStorage,
} from "./secure-keystore";

const EMAIL_KEY = "pokeliquid_wallet_email";
const LEGACY_STORAGE_KEY = "pokeliquid_session_wallet";

export const SessionWalletName = "Pokeliquid Wallet" as WalletName<"Pokeliquid Wallet">;

export class SessionWalletAdapter extends BaseSignerWalletAdapter {
  name = SessionWalletName;
  url = "https://pokeliquid.xyz";
  icon = "/logo-64.png";
  supportedTransactionVersions = null;

  private _publicKey: PublicKey | null = null;
  private _connecting = false;

  get readyState(): WalletReadyState {
    if (typeof window === "undefined") return WalletReadyState.Unsupported;
    return WalletReadyState.Loadable;
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  async connect(): Promise<void> {
    if (this._publicKey) return;
    this._connecting = true;

    try {
      // Migrate legacy localStorage key to secure IndexedDB on first connect
      if (isSecureStorageAvailable()) {
        await migrateFromLocalStorage();
      }

      // Try loading from secure store
      const pubkeyBytes = await loadPublicKeyBytes();
      if (pubkeyBytes) {
        this._publicKey = new PublicKey(pubkeyBytes);
      } else {
        // Fallback: try legacy localStorage (if IndexedDB unavailable)
        const kp = loadLegacyKeypair();
        if (kp) {
          this._publicKey = kp.publicKey;
          // Try to migrate this key to secure store
          if (isSecureStorageAvailable()) {
            await storeSecretKey(kp.secretKey);
          }
        } else {
          this._connecting = false;
          return; // No wallet — user must log in or choose guest mode
        }
      }

      this.emit("connect", this._publicKey);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._publicKey = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> {
    if (!this._publicKey) throw new Error("Wallet not connected");

    if (isSecureStorageAvailable()) {
      try {
        // Sign using secure store — key is decrypted, used, then zeroed
        await signWithStoredKey((secretKey) => {
          const kp = Keypair.fromSecretKey(secretKey);
          if (transaction instanceof Transaction) {
            transaction.partialSign(kp);
          } else {
            transaction.sign([kp]);
          }
        });
        // IndexedDB sign worked — safe to remove localStorage backup
        confirmMigration();
      } catch (e) {
        // IndexedDB failed — try recovering from localStorage backup
        console.warn("[session-wallet] IndexedDB sign failed, attempting recovery:", e);
        const recovered = await recoverFromLocalStorage();
        if (recovered) {
          // Retry with recovered key
          await signWithStoredKey((secretKey) => {
            const kp = Keypair.fromSecretKey(secretKey);
            if (transaction instanceof Transaction) {
              transaction.partialSign(kp);
            } else {
              transaction.sign([kp]);
            }
          });
        } else {
          // Last resort: try legacy localStorage directly
          const kp = loadLegacyKeypair();
          if (!kp) throw new Error("No wallet key available — please re-import your key");
          if (transaction instanceof Transaction) {
            transaction.partialSign(kp);
          } else {
            transaction.sign([kp]);
          }
        }
      }
    } else {
      // Fallback: legacy localStorage (IndexedDB unavailable)
      const kp = loadLegacyKeypair();
      if (!kp) throw new Error("No wallet key available");
      if (transaction instanceof Transaction) {
        transaction.partialSign(kp);
      } else {
        transaction.sign([kp]);
      }
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

// ── Legacy localStorage helpers (kept for fallback + migration) ──────────────

function loadLegacyKeypair(): Keypair | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(new Uint8Array(arr));
  } catch {
    return null;
  }
}

// ── Public helpers (used by auth, export, etc.) ──────────────────────────────

export async function saveSessionKeypair(kp: Keypair) {
  if (typeof window === "undefined") return;
  if (isSecureStorageAvailable()) {
    await storeSecretKey(kp.secretKey);
  } else {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(Array.from(kp.secretKey)));
  }
}

export async function loadSessionKeypair(): Promise<Keypair | null> {
  if (typeof window === "undefined") return null;
  if (isSecureStorageAvailable()) {
    const sk = await exportSecretKey();
    if (sk) {
      const kp = Keypair.fromSecretKey(sk);
      sk.fill(0);
      return kp;
    }
  }
  return loadLegacyKeypair();
}

export async function getSessionPrivateKey(): Promise<number[] | null> {
  if (typeof window === "undefined") return null;
  if (isSecureStorageAvailable()) {
    const sk = await exportSecretKey();
    if (sk) {
      const arr = Array.from(sk);
      sk.fill(0);
      return arr;
    }
  }
  // Fallback
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSessionFromPrivateKey(secretKey: number[]) {
  if (typeof window === "undefined") return;
  const sk = new Uint8Array(secretKey);
  if (isSecureStorageAvailable()) {
    await storeSecretKey(sk);
  } else {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(secretKey));
  }
  sk.fill(0);
}

export function getSavedEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(EMAIL_KEY);
}

export function setSavedEmail(email: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EMAIL_KEY, email);
}

export async function hasSessionWallet(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isSecureStorageAvailable()) {
    return await hasStoredKey();
  }
  return localStorage.getItem(LEGACY_STORAGE_KEY) !== null;
}

export async function clearSessionWallet() {
  if (typeof window === "undefined") return;
  if (isSecureStorageAvailable()) {
    await clearStoredKey();
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem("walletName");
  sessionStorage.removeItem("pokeliquid_session_id");
}

/** Create a new guest keypair, save securely, and request funding. */
export async function createGuestWallet(): Promise<void> {
  const kp = Keypair.generate();
  await saveSessionKeypair(kp);
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
