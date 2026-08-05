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

interface PayPalSubscriptionDetails {
  id?: string
  status?: string
  plan_id?: string
  billing_info?: {
    next_billing_time?: string
    last_payment?: {
      time?: string
      amount?: { currency_code?: string; value?: string }
    }
  }
}

export function getPlan(planId: string | null) {
  if (!planId || !(planId in plans)) return null
  return plans[planId as PlanId]
}

export function paypalBaseUrl(env: BillingEnv) {
  return env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date.getTime())
  const day = copy.getUTCDate()
  copy.setUTCMonth(copy.getUTCMonth() + months)
  if (copy.getUTCDate() !== day) copy.setUTCDate(0)
  return copy
}

function monthEndFrom(start: string) {
  const date = new Date(start)
  return addMonths(Number.isNaN(date.getTime()) ? new Date() : date, 1).toISOString()
}

async function ignoreDuplicateColumn(work: Promise<unknown>) {
  try {
    await work
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('duplicate column')) return
    throw error
  }
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
      `CREATE TABLE IF NOT EXISTS paypal_plan_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id TEXT NOT NULL,
        currency TEXT NOT NULL,
        amount TEXT NOT NULL,
        paypal_product_id TEXT NOT NULL,
        paypal_plan_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plan_id, currency, amount)
      )`
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS paypal_subscriptions (
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

  await ignoreDuplicateColumn(db.prepare('ALTER TABLE credit_ledger ADD COLUMN grant_id INTEGER').run())
  await ignoreDuplicateColumn(db.prepare('ALTER TABLE credit_ledger ADD COLUMN expires_at TEXT').run())
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_reference ON credit_ledger(user_id, reason, reference_id)').run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS credit_grants (
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
      )`
    )
    .run()

  await db.prepare('CREATE INDEX IF NOT EXISTS credit_grants_user_active ON credit_grants(user_id, expires_at, remaining_credits)').run()
  await db
    .prepare(
      `INSERT OR IGNORE INTO credit_grants (user_id, credits, remaining_credits, source, reference_id)
       SELECT ledger.user_id, SUM(ledger.delta), SUM(ledger.delta), 'legacy_balance', 'legacy'
       FROM credit_ledger ledger
       WHERE NOT EXISTS (SELECT 1 FROM credit_grants grants WHERE grants.user_id = ledger.user_id)
       GROUP BY ledger.user_id
       HAVING SUM(ledger.delta) > 0`
    )
    .run()
}

async function createCreditGrant(
  db: D1Database,
  input: {
    userId: number
    credits: number
    source: string
    referenceId: string
    planId?: string | null
    subscriptionId?: string | null
    periodStart?: string | null
    periodEnd?: string | null
    expiresAt?: string | null
  }
) {
  await ensureBillingSchema(db)
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO credit_grants
        (user_id, credits, remaining_credits, source, reference_id, plan_id, subscription_id, period_start, period_end, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.userId,
      input.credits,
      input.credits,
      input.source,
      input.referenceId,
      input.planId || null,
      input.subscriptionId || null,
      input.periodStart || null,
      input.periodEnd || null,
      input.expiresAt || null
    )
    .run()

  if ((result.meta?.changes || 0) !== 1) return false

  const grant = await db
    .prepare('SELECT id FROM credit_grants WHERE user_id = ? AND source = ? AND reference_id = ?')
    .bind(input.userId, input.source, input.referenceId)
    .first<{ id: number }>()

  await db
    .prepare('INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, reference_id, grant_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(input.userId, input.credits, input.source, input.referenceId, grant?.id || null, input.expiresAt || null)
    .run()

  return true
}

export async function grantFreeTrial(db: D1Database, userId: number) {
  await createCreditGrant(db, {
    userId,
    credits: 1,
    source: 'free_trial',
    referenceId: 'initial',
  })
}

export async function getCreditBalance(db: D1Database, userId: number) {
  await ensureBillingSchema(db)
  const now = new Date().toISOString()
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(remaining_credits), 0) AS balance
       FROM credit_grants
       WHERE user_id = ? AND remaining_credits > 0 AND (expires_at IS NULL OR expires_at > ?)`
    )
    .bind(userId, now)
    .first<{ balance: number }>()
  return Math.max(0, row?.balance || 0)
}

export async function reserveCredit(db: D1Database, userId: number, referenceId: string) {
  await ensureBillingSchema(db)
  const now = new Date().toISOString()
  const grant = await db
    .prepare(
      `SELECT id, expires_at
       FROM credit_grants
       WHERE user_id = ? AND remaining_credits > 0 AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at ASC, id ASC
       LIMIT 1`
    )
    .bind(userId, now)
    .first<{ id: number; expires_at: string | null }>()

  if (!grant) return false

  const result = await db
    .prepare('UPDATE credit_grants SET remaining_credits = remaining_credits - 1 WHERE id = ? AND remaining_credits > 0')
    .bind(grant.id)
    .run()
  if ((result.meta?.changes || 0) !== 1) return false

  await db
    .prepare('INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, reference_id, grant_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(userId, -1, 'remove_bg_reservation', referenceId, grant.id, grant.expires_at || null)
    .run()

  return true
}

export async function releaseCreditReservation(db: D1Database, userId: number, referenceId: string) {
  await ensureBillingSchema(db)
  const reservation = await db
    .prepare('SELECT grant_id, expires_at FROM credit_ledger WHERE user_id = ? AND reason = ? AND reference_id = ?')
    .bind(userId, 'remove_bg_reservation', referenceId)
    .first<{ grant_id: number | null; expires_at: string | null }>()

  const result = await db
    .prepare('INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, reference_id, grant_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(userId, 1, 'remove_bg_refund', referenceId, reservation?.grant_id || null, reservation?.expires_at || null)
    .run()

  if ((result.meta?.changes || 0) === 1 && reservation?.grant_id) {
    await db.prepare('UPDATE credit_grants SET remaining_credits = remaining_credits + 1 WHERE id = ?').bind(reservation.grant_id).run()
  }
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

export async function ensurePayPalPlan(env: BillingEnv, db: D1Database, plan: (typeof plans)[PlanId], currency: string) {
  await ensureBillingSchema(db)
  const existing = await db
    .prepare('SELECT paypal_plan_id FROM paypal_plan_mappings WHERE plan_id = ? AND currency = ? AND amount = ?')
    .bind(plan.id, currency, plan.price)
    .first<{ paypal_plan_id: string }>()
  if (existing?.paypal_plan_id) return existing.paypal_plan_id

  const accessToken = await getPayPalAccessToken(env)
  const productResponse = await fetch(`${paypalBaseUrl(env)}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `ibr-product-${plan.id}-${currency}-${plan.price}`,
    },
    body: JSON.stringify({
      name: `Image Background Remover ${plan.name}`,
      description: `${plan.credits} background removals per month`,
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  })

  const product = (await productResponse.json()) as { id?: string; message?: string }
  if (!productResponse.ok || !product.id) {
    throw new Error(product.message || 'Failed to create PayPal product.')
  }

  const planResponse = await fetch(`${paypalBaseUrl(env)}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `ibr-plan-${plan.id}-${currency}-${plan.price}`,
    },
    body: JSON.stringify({
      product_id: product.id,
      name: `${plan.name} monthly plan`,
      description: `${plan.credits} background removals per month`,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { currency_code: currency, value: plan.price },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    }),
  })

  const paypalPlan = (await planResponse.json()) as { id?: string; message?: string }
  if (!planResponse.ok || !paypalPlan.id) {
    throw new Error(paypalPlan.message || 'Failed to create PayPal plan.')
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO paypal_plan_mappings
       (plan_id, currency, amount, paypal_product_id, paypal_plan_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(plan.id, currency, plan.price, product.id, paypalPlan.id)
    .run()

  return paypalPlan.id
}

export async function findPlanByPayPalPlanId(db: D1Database, paypalPlanId: string | null | undefined) {
  if (!paypalPlanId) return null
  await ensureBillingSchema(db)
  const row = await db
    .prepare('SELECT plan_id FROM paypal_plan_mappings WHERE paypal_plan_id = ?')
    .bind(paypalPlanId)
    .first<{ plan_id: string }>()
  return getPlan(row?.plan_id || null)
}

export async function showPayPalSubscription(env: BillingEnv, subscriptionId: string) {
  const accessToken = await getPayPalAccessToken(env)
  const response = await fetch(`${paypalBaseUrl(env)}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = (await response.json()) as PayPalSubscriptionDetails & { message?: string }
  if (!response.ok) throw new Error(payload.message || 'Failed to read PayPal subscription.')
  return payload
}

export async function upsertPayPalSubscription(
  db: D1Database,
  input: {
    userId?: number | null
    subscriptionId: string
    planId: string
    paypalPlanId: string
    status: string
    periodStart?: string | null
    periodEnd?: string | null
  }
) {
  await ensureBillingSchema(db)
  const existing = await db
    .prepare('SELECT user_id FROM paypal_subscriptions WHERE paypal_subscription_id = ?')
    .bind(input.subscriptionId)
    .first<{ user_id: number }>()
  const userId = input.userId || existing?.user_id
  if (!userId) return false

  await db
    .prepare(
      `INSERT INTO paypal_subscriptions
        (user_id, paypal_subscription_id, plan_id, paypal_plan_id, status, current_period_start, current_period_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(paypal_subscription_id) DO UPDATE SET
        plan_id = excluded.plan_id,
        paypal_plan_id = excluded.paypal_plan_id,
        status = excluded.status,
        current_period_start = COALESCE(excluded.current_period_start, paypal_subscriptions.current_period_start),
        current_period_end = COALESCE(excluded.current_period_end, paypal_subscriptions.current_period_end),
        updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      userId,
      input.subscriptionId,
      input.planId,
      input.paypalPlanId,
      input.status,
      input.periodStart || null,
      input.periodEnd || null
    )
    .run()

  return true
}

export async function grantSubscriptionCreditsFromDetails(
  db: D1Database,
  details: PayPalSubscriptionDetails,
  fallbackUserId?: number | null
) {
  await ensureBillingSchema(db)
  if (!details.id || details.status !== 'ACTIVE' || !details.billing_info?.last_payment?.time) {
    return { ok: false, credits: 0 }
  }

  const localSubscription = await db
    .prepare('SELECT user_id, plan_id, paypal_plan_id FROM paypal_subscriptions WHERE paypal_subscription_id = ?')
    .bind(details.id)
    .first<{ user_id: number; plan_id: string; paypal_plan_id: string }>()
  const mappedPlan = getPlan(localSubscription?.plan_id || null) || (await findPlanByPayPalPlanId(db, details.plan_id))
  if (!mappedPlan) return { ok: false, credits: 0 }

  if (localSubscription?.user_id && fallbackUserId && localSubscription.user_id !== fallbackUserId) {
    return { ok: false, credits: 0, error: 'Subscription owner mismatch.' }
  }

  const userId = localSubscription?.user_id || fallbackUserId
  if (!userId) return { ok: false, credits: 0 }

  const paidAmount = details.billing_info.last_payment.amount
  const currency = paidAmount?.currency_code
  if (paidAmount?.value && paidAmount.value !== mappedPlan.price) {
    return { ok: false, credits: 0, error: 'PayPal subscription amount mismatch.' }
  }

  const periodStart = details.billing_info.last_payment.time
  const periodEnd = details.billing_info.next_billing_time || monthEndFrom(periodStart)
  await upsertPayPalSubscription(db, {
    userId,
    subscriptionId: details.id,
    planId: mappedPlan.id,
    paypalPlanId: localSubscription?.paypal_plan_id || details.plan_id || '',
    status: details.status,
    periodStart,
    periodEnd,
  })

  const granted = await createCreditGrant(db, {
    userId,
    credits: mappedPlan.credits,
    source: 'paypal_subscription',
    referenceId: `${details.id}:${periodStart}`,
    planId: mappedPlan.id,
    subscriptionId: details.id,
    periodStart,
    periodEnd,
    expiresAt: periodEnd,
  })

  return { ok: true, credits: granted ? mappedPlan.credits : 0, currency }
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

  if (!localOrder) return { ok: false, error: 'Order does not exist.' }
  if (localOrder.currency !== currency || amount.currency_code !== currency || amount.value !== localOrder.amount) {
    return { ok: false, error: 'PayPal order amount mismatch.' }
  }

  const plan = getPlan(localOrder.plan_id)
  if (!plan) return { ok: false, error: 'Plan does not exist.' }

  await db.prepare('UPDATE paypal_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE paypal_order_id = ?').bind('completed', orderId).run()
  const periodStart = new Date().toISOString()
  const periodEnd = monthEndFrom(periodStart)
  const granted = await createCreditGrant(db, {
    userId: localOrder.user_id,
    credits: plan.credits,
    source: 'paypal_purchase',
    referenceId: orderId,
    planId: plan.id,
    periodStart,
    periodEnd,
    expiresAt: periodEnd,
  })

  return { ok: true, credits: granted ? plan.credits : 0 }
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
