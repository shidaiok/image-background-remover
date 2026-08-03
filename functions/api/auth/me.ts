import { AuthEnv, ensureAuthSchema, getCookie, json, sessionCookieName, sha256 } from '../../_shared/auth'

export async function onRequestGet(context: { request: Request; env: AuthEnv }) {
  const db = context.env.DB
  if (!db) {
    return json({ user: null })
  }

  const token = getCookie(context.request, sessionCookieName(context.env))
  if (!token) {
    return json({ user: null })
  }

  await ensureAuthSchema(db)
  const sessionHash = await sha256(token)
  const user = await db
    .prepare(
      `SELECT users.id, users.email, users.name, users.avatar_url
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.session_hash = ? AND sessions.expires_at > ?`
    )
    .bind(sessionHash, new Date().toISOString())
    .first<{ id: number; email: string; name: string; avatar_url: string }>()

  return json({ user })
}
