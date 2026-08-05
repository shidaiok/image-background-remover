import { getCurrentUser, json } from '../../_shared/auth'
import { BillingEnv, grantSubscriptionCreditsFromDetails, showPayPalSubscription } from '../../_shared/billing'

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const db = context.env.DB
  if (!db) return json({ error: 'D1 database binding DB is not configured.' }, { status: 500 })

  const user = await getCurrentUser(context.request, context.env)
  if (!user) return json({ error: '请先登录后再确认订阅。' }, { status: 401 })

  const body = (await context.request.json().catch(() => null)) as { subscriptionId?: string } | null
  if (!body?.subscriptionId) return json({ error: '缺少 PayPal 订阅号。' }, { status: 400 })

  const subscription = await showPayPalSubscription(context.env, body.subscriptionId)
  const result = await grantSubscriptionCreditsFromDetails(db, subscription, user.id)
  if (!result.ok && result.error) return json({ error: result.error }, { status: 400 })

  return json({ ok: true, status: subscription.status, credits: result.credits })
}
