/**
 * Secure keystore using IndexedDB + crypto.subtle
 *
 * Ed25519 keys are encrypted with a non-extractable AES-GCM CryptoKey.
 * The raw Ed25519 key is only in memory briefly during signing, then zeroed.
 *
 * Migration: on first use, migrates plaintext keys from localStorage to IndexedDB.
 */

const DB_NAME = "pokeliquid_keystore";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const AES_KEY_ID = "aes_wrapping_key";
const WALLET_KEY_ID = "session_wallet";
const LEGACY_STORAGE_KEY = "pokeliquid_session_wallet";

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── AES wrapping key (non-extractable) ───────────────────────────────────────

async function getOrCreateAESKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await idbGet(db, AES_KEY_ID) as CryptoKey | undefined;
  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable — cannot be read by JS
    ["encrypt", "decrypt"]
  );

  await idbPut(db, AES_KEY_ID, key);
  return key;
}

// ── Encrypt / Decrypt ────────────────────────────────────────────────────────

type EncryptedPayload = {
  iv: Uint8Array;
  ciphertext: Uint8Array;
};

async function encryptKey(aesKey: CryptoKey, secretKey: Uint8Array): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      aesKey,
      new Uint8Array(secretKey) as unknown as BufferSource
    )
  );
  return { iv, ciphertext };
}

async function decryptKey(aesKey: CryptoKey, payload: EncryptedPayload): Promise<Uint8Array> {
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(payload.iv) as unknown as BufferSource },
    aesKey,
    new Uint8Array(payload.ciphertext) as unknown as BufferSource
  );
  return new Uint8Array(raw);
}

// ── Zero-fill helper ─────────────────────────────────────────────────────────

function zeroFill(arr: Uint8Array) {
  arr.fill(0);
}

// ── Public API ───────────────────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null;
function getDB(): Promise<IDBDatabase> {
  if (!_dbPromise) _dbPromise = openDB();
  return _dbPromise;
}

/**
 * Check if IndexedDB is available (not all private browsing modes support it).
 */
export function isSecureStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return typeof indexedDB !== "undefined" && typeof crypto.subtle !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Store an Ed25519 secret key securely.
 * Encrypts with non-extractable AES key and stores in IndexedDB.
 */
export async function storeSecretKey(secretKey: Uint8Array): Promise<void> {
  const db = await getDB();
  const aesKey = await getOrCreateAESKey(db);
  const encrypted = await encryptKey(aesKey, secretKey);
  await idbPut(db, WALLET_KEY_ID, encrypted);
}

/**
 * Check if a wallet key exists in the secure store.
 */
export async function hasStoredKey(): Promise<boolean> {
  try {
    const db = await getDB();
    const val = await idbGet(db, WALLET_KEY_ID);
    return val != null;
  } catch {
    return false;
  }
}

/**
 * Load the public key bytes (first 32 bytes of the secret key are the private scalar,
 * last 32 bytes are the public key in Ed25519 64-byte format).
 * This decrypts briefly to extract the pubkey, then zeros the buffer.
 */
export async function loadPublicKeyBytes(): Promise<Uint8Array | null> {
  try {
    const db = await getDB();
    const payload = await idbGet(db, WALLET_KEY_ID) as EncryptedPayload | undefined;
    if (!payload) return null;

    const aesKey = await getOrCreateAESKey(db);
    const secretKey = await decryptKey(aesKey, payload);
    // Ed25519 secret key is 64 bytes: [32 private | 32 public]
    const pubkey = new Uint8Array(secretKey.slice(32, 64));
    zeroFill(secretKey);
    return pubkey;
  } catch {
    return null;
  }
}

/**
 * Sign data using the stored key. Decrypts, signs, zeros immediately.
 * Returns the signed transaction bytes.
 */
export async function signWithStoredKey(
  signFn: (secretKey: Uint8Array) => void
): Promise<void> {
  const db = await getDB();
  const payload = await idbGet(db, WALLET_KEY_ID) as EncryptedPayload | undefined;
  if (!payload) throw new Error("No wallet key in secure store");

  const aesKey = await getOrCreateAESKey(db);
  const secretKey = await decryptKey(aesKey, payload);

  try {
    signFn(secretKey);
  } finally {
    zeroFill(secretKey);
  }
}

/**
 * Export the raw secret key (for key export modal / backup).
 * User explicitly triggers this. Returns the key and caller must handle securely.
 */
export async function exportSecretKey(): Promise<Uint8Array | null> {
  try {
    const db = await getDB();
    const payload = await idbGet(db, WALLET_KEY_ID) as EncryptedPayload | undefined;
    if (!payload) return null;

    const aesKey = await getOrCreateAESKey(db);
    return await decryptKey(aesKey, payload);
  } catch {
    return null;
  }
}

/**
 * Delete the stored wallet key.
 */
export async function clearStoredKey(): Promise<void> {
  try {
    const db = await getDB();
    await idbDelete(db, WALLET_KEY_ID);
  } catch {
    // best effort
  }
}

/**
 * Migrate from legacy localStorage to secure IndexedDB.
 * Write to IndexedDB first, verify read-back, then delete localStorage.
 * Returns true if migration happened, false if no legacy key found.
 */
export async function migrateFromLocalStorage(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // Check if legacy key exists
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return false;

  // Check if already migrated (key exists in IndexedDB)
  if (await hasStoredKey()) {
    // Already in IndexedDB — just clean up localStorage
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  }

  try {
    const arr = JSON.parse(raw);
    const secretKey = new Uint8Array(arr);

    // Write to IndexedDB
    await storeSecretKey(secretKey);

    // Verify read-back works
    const pubkey = await loadPublicKeyBytes();
    if (!pubkey || pubkey.length !== 32) {
      throw new Error("Read-back verification failed");
    }

    // Only now delete from localStorage
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    zeroFill(secretKey);

    console.log("[secure-keystore] Migrated wallet from localStorage to IndexedDB");
    return true;
  } catch (e) {
    console.error("[secure-keystore] Migration failed, keeping localStorage key:", e);
    return false;
  }
}
