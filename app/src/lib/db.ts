import { Pool } from "pg";

function getConnectionString() {
  const url = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || "";
  // Remove sslmode param — we handle SSL via the ssl option
  return url.replace(/[?&]sslmode=[^&]*/g, "").replace(/[?&]supa=[^&]*/g, "");
}

const pool = new Pool({
  connectionString: getConnectionString(),
  ssl: process.env.POSTGRES_URL ? { rejectUnauthorized: false } : false,
});

async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

let initialized = false;

async function ensureTables() {
  if (initialized) return;
  await query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      public_key TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS session_wallets (
      id SERIAL PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Add referrer column if it doesn't exist
  await query(`
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS referrer TEXT
  `);
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
  await query(
    `INSERT INTO session_wallets (session_id, public_key, encrypted_key, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, publicKey, encryptedKey, ipAddress]
  );
}

export async function getRecentSessionCount(ipAddress: string): Promise<number> {
  await ensureTables();
  const result = await query(
    `SELECT COUNT(*) as count FROM session_wallets
     WHERE ip_address = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [ipAddress]
  );
  return Number(result.rows[0]?.count ?? 0);
}

// ── Account signup/login ────────────────────────────────────────────────────

export async function createAccount(
  email: string,
  passwordHash: string,
  encryptedKey: string,
  publicKey: string,
  referrer?: string
): Promise<number> {
  await ensureTables();
  const result = await query(
    `INSERT INTO wallets (email, password_hash, encrypted_key, public_key, referrer)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email, passwordHash, encryptedKey, publicKey, referrer || null]
  );
  return result.rows[0].id;
}

export async function getReferrerByPublicKey(publicKey: string): Promise<string | null> {
  await ensureTables();
  const result = await query(
    `SELECT referrer FROM wallets WHERE public_key = $1 LIMIT 1`,
    [publicKey]
  );
  return result.rows[0]?.referrer || null;
}

export async function getAccountByEmail(
  email: string
): Promise<{ id: number; passwordHash: string; encryptedKey: string; publicKey: string | null } | null> {
  await ensureTables();
  const result = await query(
    `SELECT id, password_hash, encrypted_key, public_key FROM wallets WHERE email = $1`,
    [email]
  );
  if (result.rows.length === 0) return null;
  return {
    id: result.rows[0].id,
    passwordHash: result.rows[0].password_hash,
    encryptedKey: result.rows[0].encrypted_key,
    publicKey: result.rows[0].public_key,
  };
}

export async function emailExists(email: string): Promise<boolean> {
  await ensureTables();
  const result = await query(
    `SELECT 1 FROM wallets WHERE email = $1 LIMIT 1`,
    [email]
  );
  return result.rows.length > 0;
}

export async function updatePasswordHash(id: number, newHash: string): Promise<void> {
  await ensureTables();
  await query(`UPDATE wallets SET password_hash = $1 WHERE id = $2`, [newHash, id]);
}

// ── Password reset tokens ───────────────────────────────────────────────────

export async function createResetToken(email: string, token: string, expiresAt: Date): Promise<void> {
  await ensureTables();
  await query(
    `INSERT INTO password_reset_tokens (email, token, expires_at) VALUES ($1, $2, $3)`,
    [email, token, expiresAt]
  );
}

export async function getResetToken(
  token: string
): Promise<{ id: number; email: string; expiresAt: Date; used: boolean } | null> {
  await ensureTables();
  const result = await query(
    `SELECT id, email, expires_at, used FROM password_reset_tokens WHERE token = $1`,
    [token]
  );
  if (result.rows.length === 0) return null;
  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    expiresAt: result.rows[0].expires_at,
    used: result.rows[0].used,
  };
}

export async function markResetTokenUsed(id: number): Promise<void> {
  await ensureTables();
  await query(`UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`, [id]);
}
