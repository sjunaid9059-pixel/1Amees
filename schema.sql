-- Optional PostgreSQL schema (app works fully in-memory by default)
-- Use only if you later wire a real DB

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  mobile VARCHAR(15) UNIQUE,
  name VARCHAR(100) DEFAULT 'User',
  cookies TEXT,
  wallet_balance NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  account_id TEXT,
  total NUMERIC(12,2),
  status VARCHAR(40) DEFAULT 'pending_payment',
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  amount NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'pending',
  upi_link TEXT,
  qr_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
