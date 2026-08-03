import { AuthEnv, getOrigin, json, makeCookie, randomToken } from '../../_shared/auth'

export function onRequestGet(context: { request: Request; env: AuthEnv }) {
  const clientId = context.env.OAUTH_CLIENT_ID

  if (!clientId) {
    return json({ error: 'OAuth Client ID is not configured.' }, { status: 500 })
  }

  const state = randomToken(16)
  const redirectUri = context.env.OAUTH_REDIRECT_URI || `${getOrigin(context.request)}/api/auth/callback`
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('state', state)

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': makeCookie('oauth_state', state, 10 * 60),
    },
  })
}
