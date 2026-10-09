# ACinch example apps

Small, dependency-free apps that push items into [ACinch](https://acinch.com) with the developer platform API,
each in **Node.js**, **TypeScript** and **Python**. Every language folder stands alone: copy the one you need.

| Example | What it shows | Auth |
|---|---|---|
| [`hello-world`](hello-world) | Get a token, push one item, run it again to update it | Client credentials |
| [`webhook-push`](webhook-push) | Push alerts from any script or monitor; one key per card, so a repeat updates it | Incoming webhook URL |
| [`approval-card`](approval-card) | A rich card with Approve / Reject buttons; your server receives the click as a signed event and updates the card | Client credentials + signed event webhooks |

| Language | Folder | Runs on | Run with |
|---|---|---|---|
| Node.js | `<example>/node` | Node 18+ | `node hello.mjs` |
| TypeScript | `<example>/typescript` | Node 22.18+ (runs `.ts` directly) | `node hello.ts` |
| Python | `<example>/python` | Python 3.8+, standard library only | `python hello.py` |

Nothing to install. `npm run typecheck` (after `npm install`) type-checks the TypeScript; the TypeScript client in
[`approval-card/typescript/acinch.ts`](approval-card/typescript/acinch.ts) has types for items and events you can copy.

## Agent skill

[`skills/acinch`](skills/acinch) is an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
that teaches AI coding agents to build ACinch apps: which integration style to pick, the API and webhook contracts,
item type definitions and the mistakes to avoid. For Claude Code, copy it into your project or user skills folder:

```bash
cp -r skills/acinch .claude/skills/        # this project only
cp -r skills/acinch ~/.claude/skills/      # every project
```

## Before you start

1. Create an app in the [developer portal](https://app.acinch.com/developers) and install it (for yourself or your workspace).
2. Create a **client secret** on the app's *Credentials* tab. Note the client ID, the secret (shown once) and the installation ID.
3. Each example declares one **item type**: its `item-type.json`. In the portal open your app, *Item types*, create a type with the slug the example names and paste the JSON.

Then copy `.env.example` to `.env` and fill it in. Node 20.6+ reads it with `node --env-file=.env <file>`; for Python
(or older Node) export the variables, for example `set -a; . ./.env; set +a` in bash.

## Test

```bash
npm test
```

Runs every example in every language against a small in-process stand-in for the API (no credentials, no network).
A language whose runtime is missing is skipped; set `EXAMPLES_REQUIRE_ALL=1` to fail instead. The stand-in checks
only what the examples rely on; the real API validates much more.

## Documentation

- [Developer docs](https://app.acinch.com/developers/docs): quickstart, webhooks, templates, limits
- [Example apps](https://app.acinch.com/developers/docs/examples): a walkthrough of this repository

## License

[MIT](LICENSE)
