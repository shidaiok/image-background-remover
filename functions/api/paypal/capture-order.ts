import { getCurrentUser, json } from '../../_shared/auth'
import { BillingEnv, ensureBillingSchema, getPayPalAccessToken, getPlan, paypalBaseUrl } from '../../_shared/billing'

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const db = context.env.DB
  if (!db) return json({ error: 'D1 database binding DB is not configured.' }, { status: 500 })

  const user = await getCurrentUser(context.request, context.env)
  if (!user) return json({ error: '请先登录后再确认支付。' }, { status: 401 })

  const body = (await context.request.json().catch(() => null)) as { orderId?: string } | null
  if (!body?.orderId) return json({ error: '缺少 PayPal 订单号。' }, { status: 400 })

  await ensureBillingSchema(db)
  const localOrder = await db
    .prepare('SELECT plan_id, status FROM paypal_orders WHERE paypal_order_id = ? AND user_id = ?')
    .bind(body.orderId, user.id)
    .first<{ plan_id: string; status: string }>()

  if (!localOrder) return json({ error: '订单不存在。' }, { status: 404 })
  if (localOrder.status === 'completed') return json({ ok: true, alreadyCaptured: true })

  const plan = getPlan(localOrder.plan_id)
  if (!plan) return json({ error: '套餐配置不存在。' }, { status: 400 })

  const accessToken = await getPayPalAccessToken(context.env)
  const response = await fetch(`${paypalBaseUrl(context.env)}/v2/checkout/orders/${body.orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  const payload = (await response.json()) as {
    status?: string
    message?: string
    purchase_units?: Array<{ amount?: { currency_code?: string; value?: string } }>
  }
  if (!response.ok || payload.status !== 'COMPLETED') {
    return json({ error: payload.message || 'PayPal 支付确认失败。' }, { status: 400 })
  }

  const paidAmount = payload.purchase_units?.[0]?.amount
  const expectedCurrency = context.env.PAYPAL_CURRENCY || 'USD'
  if (paidAmount?.currency_code !== expectedCurrency || paidAmount.value !== plan.price) {
    return json({ error: 'PayPal 订单金额校验失败。' }, { status: 400 })
  }

  await db.prepare('UPDATE paypal_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE paypal_order_id = ?').bind('completed', body.orderId).run()
  await db
    .prepare('INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, reference_id) VALUES (?, ?, ?, ?)')
    .bind(user.id, plan.credits, 'paypal_purchase', body.orderId)
    .run()

  return json({ ok: true, credits: plan.credits })
}
