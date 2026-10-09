// request.ts - ask for a deploy approval. Node 22.18+, no packages.
//
//   APPROVERS=alex@example.com,sam@example.com node request.ts checkout 2.4.0 https://github.com/acme/checkout/compare/v2.3.0...v2.4.0
//
// Puts an "approval" card in each approver's ACinch feed with Approve and Reject buttons. A click is delivered to
// server.ts as a signed item.action event; the server then updates this same card.
import { putItem } from './acinch.ts'

const [service, version, changesUrl] = process.argv.slice(2)
if (!service || !version) {
  console.error('usage: node request.ts <service> <version> [changes-url]')
  process.exit(2)
}
const approvers = (process.env.APPROVERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const item = await putItem(process.env.ACINCH_INSTALLATION_ID ?? '', `approval-${service}-${version}`, {
  type: 'approval',
  title: `Deploy ${service} ${version} to production?`,
  status: 'pending',
  ...(changesUrl ? { url: changesUrl } : {}),
  fields: { state: 'pending', service, version, requested_by: process.env.REQUESTED_BY ?? 'request.ts', decided_by: null },
  // No approvers named: only the person who installed the app sees the card.
  ...(approvers.length ? { audience: { users: approvers } } : {}),
})
console.log('requested', item.external_id)
