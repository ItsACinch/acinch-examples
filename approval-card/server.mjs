// server.mjs - receive ACinch events and answer Approve / Reject clicks. Node 18+, no packages. Run: node server.mjs
//
// Set your app's event endpoint URL to https://<your host>/acinch/events. Locally, expose this port with a tunnel
// (for example `cloudflared tunnel --url http://localhost:3000`) and use the https URL it prints.
import http from 'node:http'
import { api } from './acinch.mjs'
import { verifyAcinchSignature } from './verify.mjs'

const { ACINCH_SIGNING_SECRET, PORT = '3000' } = process.env
if (!ACINCH_SIGNING_SECRET) throw new Error('set ACINCH_SIGNING_SECRET (the acinch_ss_... secret from the developer portal)')
const DECISIONS = { approve: 'approved', reject: 'rejected' }

// Delivery is at-least-once, so the same event can arrive twice.
// ponytail: in-memory, so it forgets on restart and is per process; keep event ids in your database in production.
const handled = new Set()

async function handle(event) {
  const { type, data } = event
  if (type === 'installation.created') return console.log('installed:', data.installation_id, `(${data.target_kind})`)
  if (type === 'installation.deleted') return console.log('uninstalled:', data.installation_id)
  if (type !== 'item.action') return

  const decision = DECISIONS[data.action_id]
  if (!decision) return
  const path = `/items/${encodeURIComponent(data.external_id)}`
  const item = await api(data.installation_id, 'GET', path, undefined, { allow404: true })
  // Deleted, or already decided by someone else: the first click wins, later ones change nothing.
  // ponytail: read-then-write, so two clicks in the same instant can both pass; lock per item if that matters.
  if (!item || item.fields.state !== 'pending') return console.log(`${data.external_id}: ignored ${data.action_id} from ${data.user.email}`)

  // PUT replaces the whole item, so send everything back with the decision filled in.
  const { users, boards, tenant } = item.audience
  await api(data.installation_id, 'PUT', path, {
    type: item.type,
    title: item.title,
    body: `${decision === 'approved' ? 'Approved' : 'Rejected'} by ${data.user.email} at ${new Date().toISOString()}.`,
    ...(item.url ? { url: item.url } : {}),
    occurred_at: item.occurred_at,
    status: decision,
    fields: { ...item.fields, state: decision, decided_by: data.user.email },
    audience: { ...(users.length ? { users } : {}), ...(boards.length ? { boards } : {}), ...(tenant ? { tenant } : {}) },
  })
  console.log(`${data.external_id}: ${decision} by ${data.user.email}`)
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/acinch/events') return res.writeHead(404).end()
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks) // verify the exact bytes; JSON.parse + stringify would change them

  if (!verifyAcinchSignature(ACINCH_SIGNING_SECRET, req.headers['acinch-signature'], raw)) return res.writeHead(401).end()
  const eventId = req.headers['acinch-event-id']
  if (handled.has(eventId)) return res.writeHead(200).end() // duplicate: acknowledge, do nothing

  try {
    await handle(JSON.parse(raw.toString('utf8')))
    handled.add(eventId) // only once it worked, so a retry of a failed event runs again
    res.writeHead(200).end()
  } catch (e) {
    console.error(`event ${eventId} failed:`, e.message)
    res.writeHead(500).end() // any non-2xx: ACinch retries with backoff
  }
})
server.listen(Number(PORT), () => console.log(`listening on http://localhost:${server.address().port}/acinch/events`))
