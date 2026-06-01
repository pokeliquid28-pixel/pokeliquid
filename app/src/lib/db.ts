import { sql } from "@vercel/postgres";

let initialized = false;

async function ensureTables() {
  if (initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS recovery_tokens (
      id SERIAL PRIMARY KEY,
      wallet_id INTEGER NOT NULL REFERENCES wallets(id),
      token TEXT UNIQUE NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS session_wallets (
      id SERIAL PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  initialized = true;
}

// ── Session wallets ─────────────────────────────────────────────────────────

export async function storeSessionWallet(
  sessionId: string,
  publicKey: string,
  encryptedKey: string,
  ipAddress: string
) {
  await ensureTables();
  await sql`
    INSERT INTO session_wallets (session_id, public_key, encrypted_key, ip_address)
    VALUES (${sessionId}, ${publicKey}, ${encryptedKey}, ${ipAddress})
  `;
}

export async function getRecentSessionCount(ipAddress: string): Promise<number> {
  await ensureTables();
  const result = await sql`
    SELECT COUNT(*) as count FROM session_wallets
    WHERE ip_address = ${ipAddress}
    AND created_at > NOW() - INTERVAL '1 hour'
  `;
  return Number(result.rows[0]?.count ?? 0);
}

// ── Wallet save/recover ─────────────────────────────────────────────────────

export async function saveWallet(
  email: string,
  encryptedKey: string
): Promise<number> {
  await ensureTables();
  // Upsert: if email exists, update the key
  const existing = await sql`
    SELECT id FROM wallets WHERE email = ${email}
  `;
  if (existing.rows.length > 0) {
    const walletId = existing.rows[0].id;
    await sql`
      UPDATE wallets SET encrypted_key = ${encryptedKey} WHERE id = ${walletId}
    `;
    return walletId;
  }
  const result = await sql`
    INSERT INTO wallets (email, encrypted_key)
    VALUES (${email}, ${encryptedKey})
    RETURNING id
  `;
  return result.rows[0].id;
}

export async function createRecoveryToken(
  walletId: number,
  token: string
): Promise<void> {
  await ensureTables();
  // Invalidate any existing tokens for this wallet
  await sql`
    UPDATE recovery_tokens SET used = TRUE WHERE wallet_id = ${walletId} AND used = FALSE
  `;
  await sql`
    INSERT INTO recovery_tokens (wallet_id, token, expires_at)
    VALUES (${walletId}, ${token}, NOW() + INTERVAL '24 hours')
  `;
}

export async function getWalletByToken(
  token: string
): Promise<{ walletId: number; encryptedKey: string } | null> {
  await ensureTables();
  const result = await sql`
    SELECT w.id as wallet_id, w.encrypted_key
    FROM recovery_tokens rt
    JOIN wallets w ON w.id = rt.wallet_id
    WHERE rt.token = ${token}
    AND rt.used = FALSE
    AND rt.expires_at > NOW()
  `;
  if (result.rows.length === 0) return null;
  return {
    walletId: result.rows[0].wallet_id,
    encryptedKey: result.rows[0].encrypted_key,
  };
}

export async function markTokenUsed(token: string): Promise<void> {
  await ensureTables();
  await sql`
    UPDATE recovery_tokens SET used = TRUE WHERE token = ${token}
  `;
}
