import { getOrigin, getCurrentUser, json } from '../../_shared/auth'
import { BillingEnv, ensureBillingSchema, getPayPalAccessToken, getPlan, paypalBaseUrl } from '../../_shared/billing'

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const db = context.env.DB
  if (!db) return json({ error: 'D1 database binding DB is not configured.' }, { status: 500 })

  const user = await getCurrentUser(context.request, context.env)
  if (!user) return json({ error: '请先登录后再购买套餐。' }, { status: 401 })

  const body = (await context.request.json().catch(() => null)) as { planId?: string } | null
  const plan = getPlan(body?.planId || null)
  if (!plan) return json({ error: '未知套餐。' }, { status: 400 })

  await ensureBillingSchema(db)
  const currency = context.env.PAYPAL_CURRENCY || 'USD'
  const accessToken = await getPayPalAccessToken(context.env)
  const origin = getOrigin(context.request)

  const response = await fetch(`${paypalBaseUrl(context.env)}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: plan.id,
          description: `${plan.name} monthly credits`,
          amount: { currency_code: currency, value: plan.price },
        },
      ],
      application_context: {
        brand_name: 'Image Background Remover',
        user_action: 'PAY_NOW',
        return_url: `${origin}/payment/success`,
        cancel_url: `${origin}/payment/cancel`,
      },
    }),
  })

  const order = (await response.json()) as { id?: string; links?: Array<{ href: string; rel: string }>; message?: string }
  if (!response.ok || !order.id) {
    return json({ error: order.message || '创建 PayPal 订单失败。' }, { status: 400 })
  }

  await db
    .prepare('INSERT INTO paypal_orders (user_id, paypal_order_id, plan_id, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(user.id, order.id, plan.id, plan.price, currency, 'created')
    .run()

  const approveUrl = order.links?.find((link) => link.rel === 'approve')?.href
  return json({ orderId: order.id, approveUrl })
}
