// acinch.mjs - a minimal ACinch API client. Node 18+, no packages.
// One token per installation: an app installed in three workspaces talks to each with its own token.
const BASE = process.env.ACINCH_BASE_URL ?? 'https://app.acinch.com'
const { ACINCH_CLIENT_ID, ACINCH_CLIENT_SECRET } = process.env

const tokens = new Map() // installation id -> { token, renewAt }

async function token(installationId) {
  const cached = tokens.get(installationId)
  if (cached && Date.now() < cached.renewAt) return cached.token
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${ACINCH_CLIENT_ID}:${ACINCH_CLIENT_SECRET}`).toString('base64') },
    body: new URLSearchParams({ grant_type: 'client_credentials', installation_id: installationId }),
  })
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`)
  const body = await res.json()
  // Renew a minute early so a token never runs out mid-request.
  tokens.set(installationId, { token: body.access_token, renewAt: Date.now() + (body.expires_in - 60) * 1000 })
  return body.access_token
}

/** Call /api/v1 as one installation. Returns the parsed body, or null for 204 and (with allow404) 404. */
export async function api(installationId, method, path, body, { allow404 = false, retried = false } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${await token(installationId)}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  // 401: the token was revoked or expired early. Drop it, mint a new one and retry once.
  if (res.status === 401 && !retried) {
    tokens.delete(installationId)
    return api(installationId, method, path, body, { allow404, retried: true })
  }
  if (res.status === 404 && allow404) return null
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}
