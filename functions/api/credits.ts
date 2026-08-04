import { getCurrentUser, json } from '../_shared/auth'
import { BillingEnv, getCreditBalance } from '../_shared/billing'

export async function onRequestGet(context: { request: Request; env: BillingEnv }) {
  const db = context.env.DB
  if (!db) return json({ balance: 0 })

  const user = await getCurrentUser(context.request, context.env)
  if (!user) return json({ balance: 0 })

  return json({ balance: await getCreditBalance(db, user.id) })
}
