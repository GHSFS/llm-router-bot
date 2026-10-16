<div align="center">

<p align="center">
  <strong>🇺🇸 English</strong> · <a href="./docs/locales/ko.md">🇰🇷 한국어</a> · <a href="./docs/locales/zh-CN.md">🇨🇳 中文</a> · <a href="./docs/locales/es.md">🇪🇸 Español</a> · <a href="./docs/locales/hi.md">🇮🇳 हिन्दी</a><br />
  <a href="./docs/locales/ar.md">🇸🇦 العربية</a> · <a href="./docs/locales/pt-BR.md">🇧🇷 Português</a> · <a href="./docs/locales/ru.md">🇷🇺 Русский</a> · <a href="./docs/locales/fr.md">🇫🇷 Français</a> · <a href="./docs/locales/id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> Multi-provider LLM router that fronts Telegram and Discord bots from a single Cloudflare Worker.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

### Overview

`llm-router-bot` is a single-user Cloudflare Worker that puts a thin routing
layer in front of several large language models and exposes the result as a
Telegram and (optionally) a Discord bot. It is designed for personal-use
operators who already hold API keys across multiple providers and want a
coherent fallback chain instead of manually picking which service to call
each time.

The router is rate-limit-aware: each provider has a known daily ceiling, and
the worker counts requests per provider per UTC day in a KV namespace. When
a provider hits its ceiling it is automatically dropped from the chain until
midnight UTC. The next provider in the priority list takes over without
operator intervention.

### Features

- **Three composable routing modes** — set a default provider, override one
  message at a time with a prefix, or fan out to every enabled provider in
  parallel for side-by-side comparison.
- **Provider-key gating** — providers are enabled only when their API key is
  present in the worker's secret store. Workers AI is the always-on baseline
  because it requires no key.
- **Daily quota tracking** — every dispatch increments a per-provider
  counter in KV, keyed by UTC date. Routes skip providers that are already
  over their ceiling.
- **Platform-agnostic core** — the parser, router, and provider modules know
  nothing about Telegram or Discord. Both adapters convert their inbound
  payloads into the same internal `Message` shape.
- **Owner gate on both platforms** — Telegram requests with the wrong
  `from.id` are silently dropped, Discord interactions with the wrong user
  id are rejected with an ephemeral error. The webhook URL also carries a
  per-platform secret as defence-in-depth.
- **Conversation history per user** — recent turns are kept in KV (default
  10) and replayed to the chosen provider so plain messages feel like a real
  chat. `/reset` clears the history.

### Three modes

All three modes are simultaneously available; you pick per message:

```
Mode A — set a default provider:
    /ai groq          subsequent plain messages route through Groq.

Mode B — one-shot override with a prefix:
    !gemini hello     Gemini answers this single message; the default is
                      not changed.

Mode C — compare every enabled provider:
    ? what is X       or  /all what is X
    Each enabled provider is called in parallel; replies come back as
    labelled sections.
```

Plain text with no leading command or prefix routes through the user's
current default. With no default set, the auto-fallback chain is used.

### Architecture

```
  ┌─────────────────────┐         ┌──────────────────────┐
  │  Telegram client    │──webhook│  /tg/<secret>        │
  └─────────────────────┘    ────▶│                      │
                                  │   Cloudflare Worker  │
  ┌─────────────────────┐         │  ┌────────────────┐  │
  │  Discord client     │──Ed25519│  │ parser.ts      │  │
  │  /llm slash command │   ────▶ │  │ router.ts      │  │
  └─────────────────────┘   /interactions │ providers/*  │  │
                                  │  └───────┬────────┘  │
                                  └──────────┼───────────┘
                                             │
                       ┌─────────────────────┼─────────────────────┐
                       ▼              ▼              ▼              ▼
                   ┌───────┐    ┌──────────┐   ┌──────────┐   ┌──────────┐
                   │ Groq  │    │Workers AI│   │  Gemini  │   │OpenRouter│ …
                   └───────┘    └──────────┘   └──────────┘   └──────────┘
                       │              │              │              │
                       └──────────────┴──────┬───────┴──────────────┘
                                             ▼
                                   ┌──────────────────┐
                                   │  KV: SESSIONS    │
                                   │  user state +    │
                                   │  daily quota     │
                                   └──────────────────┘
```

### Repository layout

```
llm-router-bot/
├── package.json              npm scripts: build (tsc), test (vitest),
│                             deploy (wrangler), deploy:dry-run, format
├── tsconfig.json             strict TS, allowImportingTsExtensions, noEmit
├── wrangler.example.toml     template Cloudflare Worker config; copy to
│                             wrangler.toml and fill in real KV ids
├── .gitignore                ignores wrangler.toml (real), node_modules,
│                             .dev.vars, .wrangler/, build output
├── .editorconfig
├── .prettierrc.json
├── README.md                 this file
├── LICENSE                   MIT
├── CHANGELOG.md              Keep-a-Changelog format
├── src/
│   ├── index.ts              Worker fetch handler. Routes /, /tg/<secret>,
│   │                         /interactions to the right adapter
│   ├── types.ts              Env, Message, Provider, ProviderResponse,
│   │                         ParsedCommand — shared across the worker
│   ├── parser.ts             Pure function. Parses raw text into a
│   │                         ParsedCommand (slash commands, ! prefix,
│   │                         ? compare-all, plain)
│   ├── router.ts             Mode A/B/C dispatch. Builds the auto-fallback
│   │                         chain and persists conversation history
│   ├── format.ts             Telegram MarkdownV2 escape, Discord escape,
│   │                         4096-char chunker, labelled sections
│   ├── kv.ts                 Per-user state (default provider + history)
│   │                         and helpers for the SESSIONS KV namespace
│   ├── quota.ts              Per-provider daily counter, isUnderQuota,
│   │                         incrementUsage, snapshot
│   ├── platforms/
│   │   ├── telegram.ts       Webhook handler. Owner-id gate, MarkdownV2
│   │   │                     escape, sendMessage with chunking
│   │   └── discord.ts        Interactions handler. Ed25519 verification,
│   │                         deferred response + waitUntil follow-up,
│   │                         single /llm slash command surface
│   └── providers/
│       ├── index.ts          Registry. ALL_PROVIDERS priority order,
│       │                     PREFIX_ALIASES, enabledProviders helper
│       ├── workers-ai.ts     env.AI binding wrappers (Llama 3.3 70B + 8B)
│       ├── groq.ts           Groq Chat Completions, Llama 3.3 70B
│       ├── gemini.ts         generateContent, gemini-2.5-flash + pro
│       ├── openrouter.ts     OpenRouter, DeepSeek R1 distill (reasoning)
│       ├── together.ts       Together AI, Qwen 2.5 72B (multilingual)
│       └── hf.ts             HuggingFace router, Llama 3.3 70B
├── test/
│   ├── parser.test.ts        18 cases: slash commands, ! prefix, ?
│   │                         shorthand, plain, edge cases
│   ├── router.test.ts        9 cases: control commands, KV writes,
│   │                         provider rejection on missing key
│   └── format.test.ts        10 cases: MarkdownV2 escape coverage,
│                             chunking boundary preferences, Discord escape
└── .github/workflows/
    ├── build.yml             tsc + wrangler deploy --dry-run
    └── test.yml              prettier --check + tsc + vitest
```

### Provider catalogue

The default priority order. `enabled` is determined at request time by the
presence of each provider's API key in the worker's secret store; Workers
AI is the only always-on entry.

| # | id              | Model                              | Daily ceiling | Notes                          |
|---|-----------------|------------------------------------|---------------|--------------------------------|
| 1 | `groq`          | Llama 3.3 70B Versatile            | 14,400        | Fast workhorse                 |
| 2 | `workers-ai-70b`| Llama 3.3 70B Instruct (FP8 fast)  | 10,000        | No key required (env.AI)       |
| 3 | `gemini-flash`  | Gemini 2.5 Flash                   | 250           | Quality fallback               |
| 4 | `deepseek-r1`   | DeepSeek R1 distill (OpenRouter)   | 50            | Reasoning-strong               |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct              | 10,000        | Lightweight fallback           |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo        | 600           | Multilingual specialist        |
| 7 | `hf`            | Llama 3.3 70B (HuggingFace router) | 1,000         | Auxiliary fallback             |
| 8 | `gemini-pro`    | Gemini 2.5 Pro                     | 50            | Reserved for reasoning         |

Prefix aliases for `!` and `/ai`: `groq`, `gemini`, `gemini-pro`,
`deepseek` / `r1`, `qwen` / `together`, `hf`, `workers-ai` / `cf`,
`workers-70b`, `workers-8b`, `pro`.

### Compatibility

| Axis              | Supported                                                        |
|-------------------|------------------------------------------------------------------|
| Worker runtime    | Cloudflare Workers, `compatibility_date = 2026-01-01`            |
| Node toolchain    | Node 22+ for local development and CI (required by wrangler 4.x) |
| TypeScript        | 5.7+ (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) |
| Telegram          | Bot API webhook, MarkdownV2 parse mode                           |
| Discord           | Interactions API v10, Ed25519 signature verification             |
| KV namespace      | One namespace bound as `SESSIONS`                                |
| AI binding        | `[ai] binding = "AI"`                                            |

The worker itself is platform-agnostic: it runs on the standard Cloudflare
Workers runtime with no Node.js-specific dependencies. All HTTP calls go
through the global `fetch`, all crypto through `crypto.subtle`.

### Security considerations

- **Single-user gate.** Every inbound message is checked against
  `TG_OWNER_ID` (Telegram) or `DISCORD_OWNER_ID` (Discord). Mismatches are
  silently dropped on Telegram and rejected with an ephemeral error on
  Discord. The bot never replies to an unknown user id.
- **Path-secret on Telegram.** The Telegram webhook URL is
  `/tg/<TG_WEBHOOK_SECRET>`. A secret-mismatch returns 403 before the body
  is read, so unsolicited POSTs from the open internet cost nothing.
- **Ed25519 on Discord.** Every Discord interaction is verified with the
  application's public key using `crypto.subtle.verify`. Unsigned or
  badly-signed payloads are rejected with 401 before any work is done.
- **API keys live in Cloudflare's secret store.** They are set via
  `wrangler secret put <NAME>` and are never written to source control.
  `wrangler.toml` itself is in `.gitignore`.
- **No telemetry.** The worker makes outbound calls only to provider APIs,
  Telegram, and (when enabled) Discord. Nothing is reported anywhere else.
- **Conversation history is per-user.** History is keyed by
  `user:<platform>:<userId>`. There is no cross-user sharing because there
  are no other users.

### Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Telegram bot does not reply | Webhook URL is wrong, or `from.id` does not match `TG_OWNER_ID` | Check `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`; print the user id once with a `/help` and confirm it equals `TG_OWNER_ID` |
| Webhook returns 403 | URL secret mismatch between Telegram and the worker | Re-run `setWebhook` with the same secret as `TG_WEBHOOK_SECRET` in `wrangler secret put` |
| Discord slash command says "interaction failed" | Ed25519 mismatch or worker took longer than 3 seconds | Confirm `DISCORD_PUBLIC_KEY` matches the application; check that the deferred response is actually being returned (worker logs) |
| `All providers failed` reply | All enabled providers either errored or are over quota | `/quota` to inspect; wait for UTC midnight rollover, or add a new provider key |
| `/ai groq` says "not currently enabled" | `GROQ_API_KEY` secret is missing | `wrangler secret put GROQ_API_KEY` and redeploy |
| Compare-all returns very few sections | Most providers have no key set | `/providers` to see which are enabled; add keys for the ones you want in the comparison |

### Contributing

This is a personal-use tool. PRs that improve the parser, harden the
platform adapters, or add additional providers behind the same `Provider`
interface are welcome.

Before opening a PR:

```bash
npm run format
npm run build      # tsc --noEmit
npm test           # vitest run
```

CI runs the same three checks plus `wrangler deploy --dry-run`. PRs that
break any of them will be flagged.

### Acknowledgements

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — the
  runtime hosting the worker, plus the `env.AI` binding used as the
  always-on fallback.
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — the
  CLI used for `dev`, `deploy`, `secret put`, and namespace management.
- [Vitest](https://vitest.dev) — unit-test runner for the parser, router,
  and format helpers.
- [Telegram Bot API](https://core.telegram.org/bots/api) and the
  [Discord Interactions API](https://discord.com/developers/docs/interactions/receiving-and-responding)
  documentation.
- Each upstream provider's API documentation: Groq, Google AI Studio,
  OpenRouter, Together AI, HuggingFace.

### Installation / Deployment

#### 1. Prerequisites

- A Cloudflare account.
- Node.js 22+ and npm on the local machine.
- A Telegram bot from [@BotFather](https://t.me/BotFather) (token + numeric
  user id of the operator).
- Optionally, a Discord application with a public key and an application id.
- One or more of: Groq, Google AI Studio (Gemini), OpenRouter, Together AI,
  HuggingFace API keys. None are strictly required — the worker still runs
  on Workers AI alone.

#### 2. Clone and install

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
```

#### 3. Create the KV namespace

```bash
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
```

Wrangler prints a `id` and `preview_id`; paste them into `wrangler.toml`.

#### 4. Stage the configuration

```bash
cp wrangler.example.toml wrangler.toml
# edit wrangler.toml: paste the KV ids, set TG_OWNER_ID, optionally
# DISCORD_OWNER_ID and DISCORD_APP_ID.
```

#### 5. Set the secrets

```bash
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET     # any random string

# Optional, depending on which providers you want enabled:
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put TOGETHER_API_KEY
npx wrangler secret put HF_API_KEY

# Optional, only if you enable Discord:
npx wrangler secret put DISCORD_PUBLIC_KEY
```

#### 6. Deploy

```bash
npm run deploy
# Worker URL printed: https://llm-router-bot.<your-subdomain>.workers.dev
```

#### 7. Wire up the platforms

Telegram — register the webhook (substitute your real values):

```bash
curl -X POST "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
     -d "url=https://llm-router-bot.<your-subdomain>.workers.dev/tg/<TG_WEBHOOK_SECRET>"
```

Discord — set the application's "Interactions Endpoint URL" in the
Developer Portal to:

```
https://llm-router-bot.<your-subdomain>.workers.dev/interactions
```

Then register the `/llm` slash command (one-time):

```bash
curl -X POST "https://discord.com/api/v10/applications/<DISCORD_APP_ID>/commands" \
     -H "Authorization: Bot <DISCORD_BOT_TOKEN>" \
     -H "content-type: application/json" \
     -d '{"name":"llm","description":"Talk to the LLM router","options":[{"name":"message","description":"Your message","type":3,"required":true}]}'
```

### Quick start (local dev)

```bash
# Run the worker locally with hot reload (uses .dev.vars for secrets)
npx wrangler dev

# In another terminal, hit the health endpoint:
curl http://127.0.0.1:8787/
# llm-router-bot 0.1.0
```

### Bot reference

Once deployed, send these to the bot in Telegram (or as
`/llm message:<text>` in Discord):

```
/help              show usage
/providers         list providers and their enabled state
/quota             today's usage per provider (UTC)
/history           last few turns of your conversation
/reset             clear stored history and default
/ai <provider>     Mode A: set your default provider
/all <text>        Mode C: ask every enabled provider in parallel
? <text>           Mode C shorthand for /all
!<prefix> <text>   Mode B: one-shot override
<anything else>    Plain message — uses your default or the auto chain
```

### Configuration

`wrangler.toml` carries non-secret configuration. Secrets live in Cloudflare's
encrypted store, set with `wrangler secret put`.

| Key                  | Where        | Description                                                |
|----------------------|--------------|------------------------------------------------------------|
| `TG_OWNER_ID`        | `[vars]`     | Required. Telegram numeric user id allowed to talk         |
| `TG_BOT_TOKEN`       | secret       | Required. Telegram bot token from BotFather                |
| `TG_WEBHOOK_SECRET`  | secret       | Required. Random string used in the webhook URL path       |
| `DISCORD_OWNER_ID`   | `[vars]`     | Optional. Discord user id of the operator                  |
| `DISCORD_APP_ID`     | `[vars]`     | Optional. Discord application id                           |
| `DISCORD_PUBLIC_KEY` | secret       | Optional. Discord application public key (Ed25519)         |
| `GROQ_API_KEY`       | secret       | Optional. Enables `groq` provider                          |
| `GEMINI_API_KEY`     | secret       | Optional. Enables `gemini-flash` and `gemini-pro`          |
| `OPENROUTER_API_KEY` | secret       | Optional. Enables `deepseek-r1`                            |
| `TOGETHER_API_KEY`   | secret       | Optional. Enables `together-qwen`                          |
| `HF_API_KEY`         | secret       | Optional. Enables `hf`                                     |
| `DISABLED_PROVIDERS` | `[vars]`     | Optional. Comma-separated provider ids to skip             |
| `HISTORY_TURNS`      | `[vars]`     | Optional. Conversation turns kept per user (default 10)    |

### FAQ

**Q. Why a router and not just one provider?**
A. Different providers have different strengths and different daily ceilings.
A router lets the operator combine them: small premium quotas (Gemini Pro,
DeepSeek R1) are reserved for hard prompts, larger quotas (Groq, Workers AI)
soak up everyday traffic, and the user can still override per message.

**Q. Why both Telegram and Discord?**
A. Different operators prefer different chat surfaces. Both go through the
same parser and router, so adding a third platform is a matter of writing a
new adapter under `src/platforms/`.

**Q. Where is conversation history stored?**
A. In the `SESSIONS` KV namespace under `user:<platform>:<userId>`. The
window size is `HISTORY_TURNS` (default 10). `/reset` deletes the entry.

**Q. Are messages or keys logged anywhere?**
A. The worker writes nothing to remote logs. Cloudflare may record request
metadata for its own platform observability; the operator can disable
analytics on the worker if that matters.

**Q. How are daily quotas counted?**
A. Each successful or failed dispatch increments
`quota:<providerId>:<YYYY-MM-DD>` in KV. Counters live with a 36-hour TTL
so yesterday's number is still inspectable until KV evicts it.

**Q. Can I add another provider?**
A. Implement the `Provider` interface in a new file under `src/providers/`,
add an entry to `ALL_PROVIDERS` and an alias under `PREFIX_ALIASES` in
`src/providers/index.ts`. The router needs no changes.

### License

MIT. See [LICENSE](./LICENSE).

### Disclaimer

This is a personal tool intended for the operator's own use against
provider accounts they own. The operator is solely responsible for
complying with each provider's terms of service and any applicable
acceptable-use policies. **Do not deploy this worker as a shared service
or expose it to third-party users.**

