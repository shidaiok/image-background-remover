import { D1Database } from './auth'

export interface BillingEnv {
  DB?: D1Database
  PAYPAL_CLIENT_ID?: string
  PAYPAL_CLIENT_SECRET?: string
  PAYPAL_ENV?: string
  PAYPAL_CURRENCY?: string
  PAYPAL_WEBHOOK_ID?: string
}

export const plans = {
  starter: { id: 'starter', name: 'Starter', price: '4.99', credits: 15 },
  creator: { id: 'creator', name: 'Creator', price: '12.99', credits: 50 },
} as const

export type PlanId = keyof typeof plans

export function getPlan(planId: string | null) {
  if (!planId || !(planId in plans)) return null
  return plans[planId as PlanId]
}

export function paypalBaseUrl(env: BillingEnv) {
  return env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

export async function ensureBillingSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS paypal_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        paypal_order_id TEXT NOT NULL UNIQUE,
        plan_id TEXT NOT NULL,
        amount TEXT NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS credit_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        reference_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    )
    .run()

  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_reference ON credit_ledger(user_id, reason, reference_id)').run()
}

export async function grantFreeTrial(db: D1Database, userId: number) {
  await ensureBillingSchema(db)
  await db
    .prepare('INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, reference_id) VALUES (?, ?, ?, ?)')
    .bind(userId, 1, 'free_trial', 'initial')
    .run()
}

export async function getCreditBalance(db: D1Database, userId: number) {
  await ensureBillingSchema(db)
  const row = await db.prepare('SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger WHERE user_id = ?').bind(userId).first<{ balance: number }>()
  return row?.balance || 0
}

export async function reserveCredit(db: D1Database, userId: number, referenceId: string) {
  await ensureBillingSchema(db)
  const result = await db
    .prepare(
      `INSERT INTO credit_ledger (user_id, delta, reason, reference_id)
       SELECT ?, -1, 'remove_bg_reservation', ?
       WHERE (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE user_id = ?) > 0`
    )
    .bind(userId, referenceId, userId)
    .run()

  return (result.meta?.changes || 0) === 1
}

export async function releaseCreditReservation(db: D1Database, userId: number, referenceId: string) {
  await db
    .prepare('INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, reference_id) VALUES (?, ?, ?, ?)')
    .bind(userId, 1, 'remove_bg_refund', referenceId)
    .run()
}

export async function getPayPalAccessToken(env: BillingEnv) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials are not configured.')
  }

  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)
  const response = await fetch(`${paypalBaseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  const payload = (await response.json()) as { access_token?: string; error_description?: string }
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || 'Failed to authenticate with PayPal.')
  }

  return payload.access_token
}

export async function fulfillPayPalOrder(
  db: D1Database,
  orderId: string,
  amount: { currency_code?: string; value?: string },
  currency: string
) {
  await ensureBillingSchema(db)
  const localOrder = await db
    .prepare('SELECT user_id, plan_id, amount, currency FROM paypal_orders WHERE paypal_order_id = ?')
    .bind(orderId)
    .first<{ user_id: number; plan_id: string; amount: string; currency: string }>()

  if (!localOrder) return { ok: false, error: '订单不存在。' }
  if (localOrder.currency !== currency || amount.currency_code !== currency || amount.value !== localOrder.amount) {
    return { ok: false, error: 'PayPal 订单金额校验失败。' }
  }

  const plan = getPlan(localOrder.plan_id)
  if (!plan) return { ok: false, error: '套餐配置不存在。' }

  await db.prepare('UPDATE paypal_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE paypal_order_id = ?').bind('completed', orderId).run()
  await db
    .prepare('INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, reference_id) VALUES (?, ?, ?, ?)')
    .bind(localOrder.user_id, plan.credits, 'paypal_purchase', orderId)
    .run()

  return { ok: true, credits: plan.credits }
}

export async function reversePayPalOrder(db: D1Database, orderId: string, reason: 'paypal_refund' | 'paypal_reversal') {
  await ensureBillingSchema(db)
  const localOrder = await db
    .prepare('SELECT user_id, plan_id FROM paypal_orders WHERE paypal_order_id = ?')
    .bind(orderId)
    .first<{ user_id: number; plan_id: string }>()

  if (!localOrder) return { ok: false }
  const plan = getPlan(localOrder.plan_id)
  if (!plan) return { ok: false }

  await db.prepare('UPDATE paypal_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE paypal_order_id = ?').bind(reason, orderId).run()
  await db
    .prepare('INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, reference_id) VALUES (?, ?, ?, ?)')
    .bind(localOrder.user_id, -plan.credits, reason, orderId)
    .run()

  return { ok: true }
}
