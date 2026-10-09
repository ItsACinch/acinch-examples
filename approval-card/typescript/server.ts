// server.ts - receive ACinch events and answer Approve / Reject clicks. Node 22.18+, no packages. Run: node server.ts
//
// Set your app's event endpoint URL to https://<your host>/acinch/events. Locally, expose this port with a tunnel
// (for example `cloudflared tunnel --url http://localhost:3000`) and use the https URL it prints.
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { getItem, putItem, type AcinchEvent } from './acinch.ts'
import { verifyAcinchSignature } from './verify.ts'

const { ACINCH_SIGNING_SECRET, PORT = '3000' } = process.env
if (!ACINCH_SIGNING_SECRET) throw new Error('set ACINCH_SIGNING_SECRET (the acinch_ss_... secret from the developer portal)')
const secret: string = ACINCH_SIGNING_SECRET
const DECISIONS: Record<string, 'approved' | 'rejected'> = { approve: 'approved', reject: 'rejected' }

// Delivery is at-least-once, so the same event can arrive twice.
// ponytail: in-memory, so it forgets on restart and is per process; keep event ids in your database in production.
const handled = new Set<string>()

async function handle(event: AcinchEvent): Promise<void> {
  if (event.type === 'installation.created') return void console.log('installed:', event.data.installation_id, `(${event.data.target_kind})`)
  if (event.type === 'installation.deleted') return void console.log('uninstalled:', event.data.installation_id)
  if (event.type !== 'item.action') return // ignore event types added later

  const { installation_id, external_id, action_id, user } = event.data
  const decision = DECISIONS[action_id]
  if (!decision) return
  const item = await getItem(installation_id, external_id)
  // Deleted, or already decided by someone else: the first click wins, later ones change nothing.
  // ponytail: read-then-write, so two clicks in the same instant can both pass; lock per item if that matters.
  if (!item || item.fields.state !== 'pending') return void console.log(`${external_id}: ignored ${action_id} from ${user.email}`)

  // PUT replaces the whole item, so send everything back with the decision filled in.
  const { users, boards, tenant } = item.audience
  await putItem(installation_id, external_id, {
    type: item.type ?? 'approval',
    title: item.title,
    body: `${decision === 'approved' ? 'Approved' : 'Rejected'} by ${user.email} at ${new Date().toISOString()}.`,
    ...(item.url ? { url: item.url } : {}),
    occurred_at: item.occurred_at,
    status: decision,
    fields: { ...item.fields, state: decision, decided_by: user.email },
    audience: { ...(users.length ? { users } : {}), ...(boards.length ? { boards } : {}), ...(tenant ? { tenant } : {}) },
  })
  console.log(`${external_id}: ${decision} by ${user.email}`)
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/acinch/events') return void res.writeHead(404).end()
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks) // verify the exact bytes; JSON.parse + stringify would change them

  const signature = req.headers['acinch-signature']
  if (!verifyAcinchSignature(secret, Array.isArray(signature) ? signature[0] : signature, raw)) return void res.writeHead(401).end()
  const eventId = String(req.headers['acinch-event-id'] ?? '')
  if (handled.has(eventId)) return void res.writeHead(200).end() // duplicate: acknowledge, do nothing

  try {
    await handle(JSON.parse(raw.toString('utf8')) as AcinchEvent)
    handled.add(eventId) // only once it worked, so a retry of a failed event runs again
    res.writeHead(200).end()
  } catch (e) {
    console.error(`event ${eventId} failed:`, e instanceof Error ? e.message : e)
    res.writeHead(500).end() // any non-2xx: ACinch retries with backoff
  }
})
server.listen(Number(PORT), () => console.log(`listening on http://localhost:${(server.address() as AddressInfo).port}/acinch/events`))
