// push.mjs - send a message to ACinch through an incoming webhook URL. Node 18+, no packages.
//
//   node push.mjs "Disk 91% full on db-1" --level danger --source db-1 --key disk-db-1
//   node push.mjs "Disk back to 60% on db-1" --level success --source db-1 --key disk-db-1   (updates the same card)
//
// The hook URL is the only credential: no OAuth, no token. Keep it in ACINCH_HOOK_URL, never in code.
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    level: { type: 'string', default: 'info' }, // info | warning | danger | success: picks the badge colour
    source: { type: 'string', default: 'push.mjs' },
    key: { type: 'string' }, // same key = same card, updated in place
    url: { type: 'string' }, // optional link on the card
  },
})
const title = positionals.join(' ')
if (!title) {
  console.error('usage: node push.mjs "<message>" [--level info|warning|danger|success] [--source name] [--key id] [--url https://...]')
  process.exit(2)
}

const res = await fetch(process.env.ACINCH_HOOK_URL, {
  method: 'POST',
  // Without a key every push is a new card. With one, a repeat updates the card it made before.
  headers: { 'content-type': 'application/json', ...(values.key ? { 'Idempotency-Key': values.key } : {}) },
  body: JSON.stringify({
    // No "type": the hook's default type (alert) is used. No "audience": the hook's default audience is used.
    title,
    ...(values.url ? { url: values.url } : {}),
    fields: { level: values.level, source: values.source },
  }),
})
if (!res.ok) throw new Error(`ACinch answered ${res.status}: ${await res.text()}`)
const item = await res.json()
console.log(res.status === 201 ? 'created' : 'updated', item.external_id)
