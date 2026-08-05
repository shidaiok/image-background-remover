CREATE TABLE IF NOT EXISTS paypal_plan_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount TEXT NOT NULL,
  paypal_product_id TEXT NOT NULL,
  paypal_plan_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id, currency, amount)
);

CREATE TABLE IF NOT EXISTS paypal_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  paypal_subscription_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  paypal_plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE credit_ledger ADD COLUMN grant_id INTEGER;
ALTER TABLE credit_ledger ADD COLUMN expires_at TEXT;

CREATE TABLE IF NOT EXISTS credit_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  remaining_credits INTEGER NOT NULL,
  source TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  plan_id TEXT,
  subscription_id TEXT,
  period_start TEXT,
  period_end TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, source, reference_id)
);

CREATE INDEX IF NOT EXISTS credit_grants_user_active ON credit_grants(user_id, expires_at, remaining_credits);

INSERT OR IGNORE INTO credit_grants (user_id, credits, remaining_credits, source, reference_id)
SELECT ledger.user_id, SUM(ledger.delta), SUM(ledger.delta), 'legacy_balance', 'legacy'
FROM credit_ledger ledger
WHERE NOT EXISTS (SELECT 1 FROM credit_grants grants WHERE grants.user_id = ledger.user_id)
GROUP BY ledger.user_id
HAVING SUM(ledger.delta) > 0;
