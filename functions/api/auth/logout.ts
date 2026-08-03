import { AuthEnv, clearCookie, getCookie, json, sessionCookieName, sha256 } from '../../_shared/auth'

export async function onRequestPost(context: { request: Request; env: AuthEnv }) {
  const db = context.env.DB
  const cookieName = sessionCookieName(context.env)
  const token = getCookie(context.request, cookieName)

  if (db && token) {
    await db.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(await sha256(token)).run()
  }

  return json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': clearCookie(cookieName),
      },
    }
  )
}
