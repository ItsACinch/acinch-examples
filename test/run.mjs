// npm test - runs every example against a small in-process stand-in for the ACinch API and checks what it stored.
// The stand-in implements only what the examples call; the real API validates far more (types, audiences, limits).
import assert from 'node:assert/strict'
import { execFile, spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CLIENT = { id: 'acinch_app_test', secret: 'acinch_cs_test', installation: 'inst-1' }
const HOOK = 'acinch_hk_test'
const SIGNING_SECRET = 'acinch_ss_test'
const items = new Map() // external id -> item

const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
const save = (res, key, body) => {
  const existed = items.has(key)
  const item = { id: existed ? items.get(key).id : crypto.randomUUID(), external_id: key, body: null, url: null, status: null, fields: {},
    occurred_at: new Date().toISOString(), ...body, audience: { users: [], boards: [], tenant: false, ...body.audience } }
  items.set(key, item)
  json(res, existed ? 200 : 201, item)
}

const api = http.createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  const { pathname } = new URL(req.url, 'http://x')
  if (req.method === 'POST' && pathname === '/oauth/token') {
    const basic = 'Basic ' + Buffer.from(`${CLIENT.id}:${CLIENT.secret}`).toString('base64')
    const form = new URLSearchParams(raw)
    if (req.headers.authorization !== basic || form.get('installation_id') !== CLIENT.installation) return json(res, 401, {})
    return json(res, 200, { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 })
  }
  if (req.method === 'POST' && pathname === `/api/v1/hooks/${HOOK}`) {
    return save(res, req.headers['idempotency-key'] ?? crypto.randomUUID(), { type: 'alert', ...JSON.parse(raw), audience: { tenant: true } })
  }
  const m = /^\/api\/v1\/items\/([^/]+)$/.exec(pathname)
  if (!m) return json(res, 404, {})
  if (req.headers.authorization !== 'Bearer tok') return json(res, 401, {})
  const key = decodeURIComponent(m[1])
  if (req.method === 'PUT') return save(res, key, JSON.parse(raw))
  if (req.method === 'GET') return items.has(key) ? json(res, 200, items.get(key)) : json(res, 404, {})
  json(res, 405, {})
})
await new Promise((r) => api.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${api.address().port}`
const env = { ...process.env, ACINCH_BASE_URL: base, ACINCH_CLIENT_ID: CLIENT.id, ACINCH_CLIENT_SECRET: CLIENT.secret, ACINCH_INSTALLATION_ID: CLIENT.installation }

// Each example in each language. TypeScript needs Node 22.18+ (type stripping); Python needs 3.8+ on PATH.
const python = ['python3', 'python', 'py'].find((p) => spawnSync(p, ['-c', 'import sys; assert sys.version_info >= (3, 8)']).status === 0)
const LANGS = {
  node: { cmd: process.execPath, ext: 'mjs', skip: null },
  typescript: { cmd: process.execPath, ext: 'ts', skip: process.features.typescript ? null : `Node ${process.version} cannot run .ts (needs 22.18+)` },
  python: { cmd: python, ext: 'py', skip: python ? null : 'no python 3.8+ on PATH' },
}
const strict = process.env.EXAMPLES_REQUIRE_ALL === '1'

const run = (lang, file, args = [], extra = {}) => new Promise((resolve, reject) => {
  const { cmd, ext } = LANGS[lang]
  execFile(cmd, [path.join(ROOT, `${file}.${ext}`), ...args], { env: { ...env, ...extra } }, (err, out, errOut) =>
    (err ? reject(new Error(`${lang} ${file} failed:\n${out}${errOut}`)) : resolve(out)))
})

async function check(lang) {
  items.clear()
  // hello-world: same ID twice is one item
  assert.match(await run(lang, `hello-world/${lang}/hello`), /^created hello-world/)
  assert.match(await run(lang, `hello-world/${lang}/hello`), /^updated hello-world/)
  assert.equal(items.get('hello-world').type, 'hello')

  // webhook-push: same key updates the card
  const hookEnv = { ACINCH_HOOK_URL: `${base}/api/v1/hooks/${HOOK}` }
  assert.match(await run(lang, `webhook-push/${lang}/push`, ['Disk 91% full', '--level', 'danger', '--source', 'db-1', '--key', 'disk-db-1'], hookEnv), /^created disk-db-1/)
  assert.match(await run(lang, `webhook-push/${lang}/push`, ['Disk back to 60%', '--level', 'success', '--source', 'db-1', '--key', 'disk-db-1'], hookEnv), /^updated disk-db-1/)
  assert.deepEqual(items.get('disk-db-1').fields, { level: 'success', source: 'db-1' })

  // approval-card: request, then a signed click
  const ext = 'approval-checkout-2.4.0'
  await run(lang, `approval-card/${lang}/request`, ['checkout', '2.4.0', 'https://example.com/diff'], { APPROVERS: 'alex@example.com' })
  assert.equal(items.get(ext).fields.state, 'pending')

  const server = spawn(LANGS[lang].cmd, [path.join(ROOT, `approval-card/${lang}/server.${LANGS[lang].ext}`)],
    { env: { ...env, ACINCH_SIGNING_SECRET: SIGNING_SECRET, PORT: '0' } })
  let log = ''
  server.stderr.on('data', (d) => (log += d))
  const port = await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => { log += d; const p = /localhost:(\d+)/.exec(String(d)); if (p) resolve(p[1]) })
    server.on('exit', (code) => reject(new Error(`${lang} server exited ${code}:\n${log}`)))
  })
  const click = (id, action, email, secret = SIGNING_SECRET) => {
    const body = JSON.stringify({ id, type: 'item.action', created_at: new Date().toISOString(),
      data: { installation_id: CLIENT.installation, external_id: ext, action_id: action, user: { id: 'u1', email } } })
    const t = Math.floor(Date.now() / 1000)
    const sig = `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
    return fetch(`http://127.0.0.1:${port}/acinch/events`, { method: 'POST', body, headers: { 'ACinch-Event-Id': id, 'ACinch-Signature': sig } })
  }
  try {
    assert.equal((await click('evt_0', 'approve', 'alex@example.com', 'wrong')).status, 401, 'bad signature is rejected')
    assert.equal(items.get(ext).fields.state, 'pending')
    assert.equal((await click('evt_1', 'approve', 'alex@example.com')).status, 200)
    const decided = items.get(ext)
    assert.equal(decided.fields.state, 'approved')
    assert.equal(decided.fields.decided_by, 'alex@example.com')
    assert.equal(decided.url, 'https://example.com/diff', 'PUT kept the link')
    assert.deepEqual(decided.audience.users, ['alex@example.com'], 'PUT kept the audience')
    assert.equal((await click('evt_1', 'reject', 'sam@example.com')).status, 200, 'duplicate event id is acknowledged')
    assert.equal((await click('evt_2', 'reject', 'sam@example.com')).status, 200)
    assert.equal(items.get(ext).fields.state, 'approved', 'first decision wins')
  } finally {
    server.kill()
  }
}

try {
  let skipped = 0
  for (const [lang, { skip }] of Object.entries(LANGS)) {
    if (skip) {
      if (strict) throw new Error(`${lang}: ${skip}`)
      console.log(`SKIP ${lang}: ${skip}`)
      skipped++
      continue
    }
    await check(lang)
    console.log(`ok   ${lang}`)
  }
  console.log(skipped ? `passed, ${skipped} language(s) skipped` : 'all examples passed')
} finally {
  api.close()
}
