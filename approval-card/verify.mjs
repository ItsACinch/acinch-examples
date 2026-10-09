// verify.mjs - check the ACinch-Signature header on an event delivery.
import crypto from 'node:crypto'

// secret: your app's signing secret (acinch_ss_...)
// header: the ACinch-Signature header, "t=<unix seconds>,v1=<hex HMAC-SHA256>"
// rawBody: the request body EXACTLY as received (a Buffer or string, never re-serialized JSON)
export function verifyAcinchSignature(secret, header, rawBody, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header || '')
  if (!m) return false
  const t = Number(m[1])
  if (Math.abs(nowSec - t) > toleranceSec) return false // a replayed old delivery
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'))
  return crypto.timingSafeEqual(expected, Buffer.from(m[2]))
}
