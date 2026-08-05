import { json } from '../../_shared/auth'
import {
  BillingEnv,
  findPlanByPayPalPlanId,
  fulfillPayPalOrder,
  grantSubscriptionCreditsFromDetails,
  getPayPalAccessToken,
  getPlan,
  paypalBaseUrl,
  reversePayPalOrder,
  showPayPalSubscription,
  upsertPayPalSubscription,
} from '../../_shared/billing'

interface PayPalWebhookEvent {
  event_type?: string
  resource?: {
    id?: string
    status?: string
    plan_id?: string
    billing_agreement_id?: string
    amount?: { currency_code?: string; value?: string }
    supplementary_data?: { related_ids?: { order_id?: string } }
  }
}

async function syncSubscriptionStatus(db: NonNullable<BillingEnv['DB']>, env: BillingEnv, subscriptionId: string) {
  const details = await showPayPalSubscription(env, subscriptionId)
  if (!details.id) return

  const localSubscription = await db
    .prepare('SELECT user_id, plan_id, paypal_plan_id FROM paypal_subscriptions WHERE paypal_subscription_id = ?')
    .bind(details.id)
    .first<{ user_id: number; plan_id: string; paypal_plan_id: string }>()
  const plan = getPlan(localSubscription?.plan_id || null) || (await findPlanByPayPalPlanId(db, details.plan_id))
  if (!plan) return

  await upsertPayPalSubscription(db, {
    userId: localSubscription?.user_id || null,
    subscriptionId: details.id,
    planId: plan.id,
    paypalPlanId: localSubscription?.paypal_plan_id || details.plan_id || '',
    status: details.status || 'UNKNOWN',
    periodStart: details.billing_info?.last_payment?.time || null,
    periodEnd: details.billing_info?.next_billing_time || null,
  })
}

export async function onRequestPost(context: { request: Request; env: BillingEnv }) {
  const { request, env } = context
  const db = env.DB
  if (!db || !env.PAYPAL_WEBHOOK_ID) {
    return json({ error: 'PayPal webhook is not configured.' }, { status: 500 })
  }

  const rawBody = await request.text()
  const event = JSON.parse(rawBody) as PayPalWebhookEvent
  const requiredHeaders = {
    auth_algo: request.headers.get('paypal-auth-algo'),
    cert_url: request.headers.get('paypal-cert-url'),
    transmission_id: request.headers.get('paypal-transmission-id'),
    transmission_sig: request.headers.get('paypal-transmission-sig'),
    transmission_time: request.headers.get('paypal-transmission-time'),
  }

  if (Object.values(requiredHeaders).some((value) => !value)) {
    return json({ error: 'Missing PayPal webhook headers.' }, { status: 400 })
  }

  const accessToken = await getPayPalAccessToken(env)
  const verificationResponse = await fetch(`${paypalBaseUrl(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...requiredHeaders,
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    }),
  })

  const verification = (await verificationResponse.json()) as { verification_status?: string }
  if (!verificationResponse.ok || verification.verification_status !== 'SUCCESS') {
    return json({ error: 'Invalid PayPal webhook signature.' }, { status: 400 })
  }

  const orderId = event.resource?.supplementary_data?.related_ids?.order_id
  const currency = env.PAYPAL_CURRENCY || 'USD'

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && orderId) {
    const result = await fulfillPayPalOrder(db, orderId, event.resource?.amount || {}, currency)
    if (!result.ok) return json({ error: result.error }, { status: 400 })
  }

  if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED' && orderId) {
    await reversePayPalOrder(db, orderId, 'paypal_refund')
  }

  if (event.event_type === 'PAYMENT.CAPTURE.REVERSED' && orderId) {
    await reversePayPalOrder(db, orderId, 'paypal_reversal')
  }

  const subscriptionId = event.resource?.billing_agreement_id || event.resource?.id

  if (event.event_type === 'PAYMENT.SALE.COMPLETED' && subscriptionId) {
    const details = await showPayPalSubscription(env, subscriptionId)
    const result = await grantSubscriptionCreditsFromDetails(db, details)
    if (!result.ok && result.error) return json({ error: result.error }, { status: 400 })
  }

  if (
    subscriptionId &&
    [
      'BILLING.SUBSCRIPTION.ACTIVATED',
      'BILLING.SUBSCRIPTION.UPDATED',
      'BILLING.SUBSCRIPTION.CANCELLED',
      'BILLING.SUBSCRIPTION.EXPIRED',
      'BILLING.SUBSCRIPTION.SUSPENDED',
      'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
    ].includes(event.event_type || '')
  ) {
    await syncSubscriptionStatus(db, env, subscriptionId)
    if (event.event_type === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const details = await showPayPalSubscription(env, subscriptionId)
      const result = await grantSubscriptionCreditsFromDetails(db, details)
      if (!result.ok && result.error) return json({ error: result.error }, { status: 400 })
    }
  }

  return json({ ok: true })
}
