import { AuthEnv, getOrigin, json, makeCookie, randomToken } from '../../_shared/auth'

export function onRequestGet(context: { request: Request; env: AuthEnv }) {
  const clientId = context.env.OAUTH_CLIENT_ID

  if (!clientId) {
    return json({ error: 'OAuth Client ID is not configured.' }, { status: 500 })
  }

  const state = randomToken(16)
  const redirectUri = context.env.OAUTH_REDIRECT_URI || `${getOrigin(context.request)}/api/auth/callback`
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': makeCookie('oauth_state', state, 10 * 60),
    },
  })
}
