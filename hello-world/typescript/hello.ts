// hello.ts - push one item into ACinch. Node 22.18+ runs TypeScript directly, no packages. Run: node hello.ts
const {
  ACINCH_BASE_URL = 'https://app.acinch.com',
  ACINCH_CLIENT_ID = '',
  ACINCH_CLIENT_SECRET = '',
  ACINCH_INSTALLATION_ID = '',
} = process.env

type TokenResponse = { access_token: string; token_type: 'Bearer'; expires_in: number }
type Item = { id: string; external_id: string; title: string; body: string | null }

// 1. Trade the app's credentials for a token that acts as one installation. It is valid for an hour.
const tokenRes = await fetch(`${ACINCH_BASE_URL}/oauth/token`, {
  method: 'POST',
  headers: { authorization: 'Basic ' + Buffer.from(`${ACINCH_CLIENT_ID}:${ACINCH_CLIENT_SECRET}`).toString('base64') },
  body: new URLSearchParams({ grant_type: 'client_credentials', installation_id: ACINCH_INSTALLATION_ID }),
})
if (!tokenRes.ok) throw new Error(`token: ${tokenRes.status} ${await tokenRes.text()}`)
const { access_token } = (await tokenRes.json()) as TokenResponse

// 2. PUT an item under an ID you choose. The first run creates it (201); every later run updates it (200).
//    No audience, so only the person who installed the app sees it.
const res = await fetch(`${ACINCH_BASE_URL}/api/v1/items/hello-world`, {
  method: 'PUT',
  headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    type: 'hello',
    title: 'Hello, world!',
    body: `Sent at ${new Date().toLocaleTimeString()} by the hello-world example.`,
  }),
})
if (!res.ok) throw new Error(`push: ${res.status} ${await res.text()}`)
const item = (await res.json()) as Item
console.log(res.status === 201 ? 'created' : 'updated', item.external_id)
