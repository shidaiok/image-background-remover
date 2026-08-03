export interface D1Database {
  prepare(query: string): D1PreparedStatement
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
}

export interface AuthEnv {
  DB?: D1Database
  OAUTH_CLIENT_ID?: string
  OAUTH_CLIENT_SECRET?: string
  OAUTH_REDIRECT_URI?: string
  SESSION_COOKIE_NAME?: string
}

const SESSION_DAYS = 30

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init)
}

export function getOrigin(request: Request) {
  return new URL(request.url).origin
}

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('Cookie') || ''
  const item = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return item ? decodeURIComponent(item.slice(name.length + 1)) : ''
}

export function sessionCookieName(env: AuthEnv) {
  return env.SESSION_COOKIE_NAME || 'ibr_session'
}

export function makeCookie(name: string, value: string, maxAge: number) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ].join('; ')
}

export function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export function randomToken(bytes = 32) {
  const values = new Uint8Array(bytes)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function ensureAuthSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        email TEXT,
        name TEXT,
        avatar_url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_user_id)
      )`
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    )
    .run()
}

export function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export const sessionMaxAge = SESSION_DAYS * 24 * 60 * 60
