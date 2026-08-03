import {
  AuthEnv,
  clearCookie,
  ensureAuthSchema,
  getCookie,
  getOrigin,
  json,
  makeCookie,
  randomToken,
  sessionCookieName,
  sessionExpiresAt,
  sessionMaxAge,
  sha256,
} from '../../_shared/auth'

interface GoogleUser {
  sub: string
  email: string
  name?: string
  picture?: string
}

export async function onRequestGet(context: { request: Request; env: AuthEnv }) {
  const { env, request } = context
  const db = env.DB

  if (!db) {
    return json({ error: 'D1 database binding DB is not configured.' }, { status: 500 })
  }

  if (!env.OAUTH_CLIENT_ID || !env.OAUTH_CLIENT_SECRET) {
    return json({ error: 'OAuth client credentials are not configured.' }, { status: 500 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = getCookie(request, 'oauth_state')

  if (!code || !state || state !== expectedState) {
    return json({ error: 'OAuth state validation failed.' }, { status: 400 })
  }

  const redirectUri = env.OAUTH_REDIRECT_URI || `${getOrigin(request)}/api/auth/google/callback`
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string; error_description?: string }
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return json({ error: tokenPayload.error_description || 'OAuth token exchange failed.' }, { status: 400 })
  }

  const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      Accept: 'application/json',
    },
  })

  if (!userResponse.ok) {
    return json({ error: 'Failed to fetch OAuth user profile.' }, { status: 400 })
  }

  const profile = (await userResponse.json()) as GoogleUser

  await ensureAuthSchema(db)
  await db
    .prepare(
      `INSERT INTO users (provider, provider_user_id, email, name, avatar_url, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(provider, provider_user_id)
       DO UPDATE SET email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url, updated_at = CURRENT_TIMESTAMP`
    )
    .bind('google', profile.sub, profile.email || '', profile.name || profile.email || '', profile.picture || '')
    .run()

  const user = await db
    .prepare('SELECT id FROM users WHERE provider = ? AND provider_user_id = ?')
    .bind('google', profile.sub)
    .first<{ id: number }>()

  if (!user) {
    return json({ error: 'Failed to create login session.' }, { status: 500 })
  }

  const sessionToken = randomToken()
  const sessionHash = await sha256(sessionToken)
  await db
    .prepare('INSERT INTO sessions (user_id, session_hash, expires_at) VALUES (?, ?, ?)')
    .bind(user.id, sessionHash, sessionExpiresAt())
    .run()

  const headers = new Headers({ Location: '/' })
  headers.append('Set-Cookie', clearCookie('oauth_state'))
  headers.append('Set-Cookie', makeCookie(sessionCookieName(env), sessionToken, sessionMaxAge))

  return new Response(null, {
    status: 302,
    headers,
  })
}
