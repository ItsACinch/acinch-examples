// acinch.ts - a minimal typed ACinch API client. Node 22.18+, no packages.
// One token per installation: an app installed in three workspaces talks to each with its own token.
const BASE = process.env.ACINCH_BASE_URL ?? 'https://app.acinch.com'
const { ACINCH_CLIENT_ID = '', ACINCH_CLIENT_SECRET = '' } = process.env

export type FieldValue = string | number | boolean | null
export type Audience = { users?: string[]; boards?: string[]; tenant?: boolean }

/** What you send: PUT /api/v1/items/{externalId}. */
export type ItemInput = {
  type: string
  title: string
  body?: string
  url?: string
  occurred_at?: string
  actor?: { name: string; email?: string; avatar_url?: string }
  status?: string
  fields?: Record<string, FieldValue>
  audience?: Audience
}

/** What you get back. */
export type Item = {
  id: string
  external_id: string
  type: string | null
  title: string
  body: string | null
  url: string | null
  occurred_at: string
  actor: { name: string; email: string | null; avatar_url: string | null } | null
  status: string | null
  fields: Record<string, FieldValue>
  audience: { users: string[]; boards: string[]; tenant: boolean }
  created_at: string | null
  updated_at: string | null
}

/** Events POSTed to your event endpoint. */
export type AcinchEvent =
  | { id: string; type: 'installation.created'; created_at: string; data: { installation_id: string; target_kind: 'user' | 'tenant' } }
  | { id: string; type: 'installation.deleted'; created_at: string; data: { installation_id: string } }
  | {
      id: string
      type: 'item.action'
      created_at: string
      data: { installation_id: string; external_id: string; action_id: string; user: { id: string; email: string } }
    }

const tokens = new Map<string, { token: string; renewAt: number }>()

async function token(installationId: string): Promise<string> {
  const cached = tokens.get(installationId)
  if (cached && Date.now() < cached.renewAt) return cached.token
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${ACINCH_CLIENT_ID}:${ACINCH_CLIENT_SECRET}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'client_credentials', installation_id: installationId }),
  })
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { access_token: string; expires_in: number }
  // Renew a minute early so a token never runs out mid-request.
  tokens.set(installationId, { token: body.access_token, renewAt: Date.now() + (body.expires_in - 60) * 1000 })
  return body.access_token
}

/** Call /api/v1 as one installation. Returns the parsed body, or null for 204 and (with allow404) 404. */
export async function api<T>(installationId: string, method: string, path: string, body?: unknown,
  opts: { allow404?: boolean; retried?: boolean } = {}): Promise<T | null> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${await token(installationId)}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  // 401: the token was revoked or expired early. Drop it, mint a new one and retry once.
  if (res.status === 401 && !opts.retried) {
    tokens.delete(installationId)
    return api<T>(installationId, method, path, body, { ...opts, retried: true })
  }
  if (res.status === 404 && opts.allow404) return null
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : ((await res.json()) as T)
}

export const getItem = (installationId: string, externalId: string) =>
  api<Item>(installationId, 'GET', `/items/${encodeURIComponent(externalId)}`, undefined, { allow404: true })

export const putItem = async (installationId: string, externalId: string, item: ItemInput) =>
  (await api<Item>(installationId, 'PUT', `/items/${encodeURIComponent(externalId)}`, item))!
