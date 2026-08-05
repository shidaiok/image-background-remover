import { getCurrentUser, getOrigin, json } from '../../_shared/auth'
import {
  BillingEnv,
  ensureBillingSchema,
  ensurePayPalPlan,
  getPayPalAccessToken,
  getPlan,
  paypalBaseUrl,
  upsertPayPalSubscription,
} from '../../_shared/billing'

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
  const paypalPlanId = await ensurePayPalPlan(context.env, db, plan, currency)
  const accessToken = await getPayPalAccessToken(context.env)
  const origin = getOrigin(context.request)

  const response = await fetch(`${paypalBaseUrl(context.env)}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: paypalPlanId,
      custom_id: `${user.id}:${plan.id}`,
      application_context: {
        brand_name: 'Image Background Remover',
        locale: 'zh-CN',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${origin}/payment/success`,
        cancel_url: `${origin}/payment/cancel`,
      },
    }),
  })

  const subscription = (await response.json()) as {
    id?: string
    status?: string
    links?: Array<{ href: string; rel: string }>
    message?: string
  }
  if (!response.ok || !subscription.id) {
    return json({ error: subscription.message || '创建 PayPal 订阅失败。' }, { status: 400 })
  }

  await upsertPayPalSubscription(db, {
    userId: user.id,
    subscriptionId: subscription.id,
    planId: plan.id,
    paypalPlanId,
    status: subscription.status || 'APPROVAL_PENDING',
  })

  const approveUrl = subscription.links?.find((link) => link.rel === 'approve')?.href
  return json({ subscriptionId: subscription.id, approveUrl })
}
