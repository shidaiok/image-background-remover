import { getCurrentUser } from '../_shared/auth'
import { BillingEnv, ensureBillingSchema, reserveCredit, releaseCreditReservation } from '../_shared/billing'

export async function onRequestPost(context: {
  request: Request
  env: BillingEnv & { REMOVE_BG_API_KEY?: string }
}) {
  const db = context.env.DB
  if (!db) {
    return Response.json({ error: '服务暂未配置额度系统。' }, { status: 500 })
  }

  const user = await getCurrentUser(context.request, context.env)
  if (!user) {
    return Response.json({ error: '请先登录后再处理图片。' }, { status: 401 })
  }

  await ensureBillingSchema(db)
  const requestId = crypto.randomUUID()
  if (!(await reserveCredit(db, user.id, requestId))) {
    return Response.json({ error: '额度不足，请先购买套餐。' }, { status: 402 })
  }

  const formData = await context.request.formData()
  const image = formData.get('image')

  if (!(image instanceof File)) {
    await releaseCreditReservation(db, user.id, requestId)
    return Response.json({ error: '请先上传图片。' }, { status: 400 })
  }

  const apiKey = context.env.REMOVE_BG_API_KEY
  if (!apiKey) {
    await releaseCreditReservation(db, user.id, requestId)
    return Response.json({ error: '服务端未配置 Remove.bg API Key。' }, { status: 500 })
  }

  const upstream = new FormData()
  upstream.append('image_file', image, image.name)
  upstream.append('size', 'auto')
  upstream.append('format', 'png')

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
    },
    body: upstream,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    await releaseCreditReservation(db, user.id, requestId)
    return Response.json({ error: message || 'Remove.bg 返回错误，请稍后重试。' }, { status: response.status })
  }

  const buffer = await response.arrayBuffer()
  await db.prepare('UPDATE credit_ledger SET reason = ? WHERE user_id = ? AND reason = ? AND reference_id = ?').bind('remove_bg_success', user.id, 'remove_bg_reservation', requestId).run()

  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${image.name.replace(/\.[^.]+$/, '')}-no-bg.png"`,
    },
  })
}

export function onRequestGet() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}
