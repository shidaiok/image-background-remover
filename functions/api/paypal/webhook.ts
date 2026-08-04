import { json } from '../../_shared/auth'
import { BillingEnv, fulfillPayPalOrder, getPayPalAccessToken, paypalBaseUrl, reversePayPalOrder } from '../../_shared/billing'

interface PayPalWebhookEvent {
  event_type?: string
  resource?: {
    amount?: { currency_code?: string; value?: string }
    supplementary_data?: { related_ids?: { order_id?: string } }
  }
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

  return json({ ok: true })
}
