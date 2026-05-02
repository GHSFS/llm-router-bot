# llm-router-bot

> Multi-provider LLM router that fronts Telegram and Discord bots from a single Cloudflare Worker.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English](#english) · [한국어](#한국어) · [日本語](#日本語) · [中文](#中文) · [Русский](#русский) · [Tiếng Việt](#tiếng-việt) · [Türkçe](#türkçe) · [Deutsch](#deutsch) · [Español](#español) · [Português](#português)

---

## English

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

---

## 한국어

### 개요

`llm-router-bot`은 여러 대형 언어 모델 앞에 얇은 라우팅 계층을 두고, 그
결과를 텔레그램 봇과 (선택적으로) 디스코드 봇으로 노출하는 단일 사용자용
Cloudflare Worker입니다. 여러 프로바이더의 API 키를 이미 가지고 있는 개인
운영자가, 매번 서비스를 직접 고르는 대신 일관된 폴백 체인을 쓰고 싶을 때
적합합니다.

라우터는 레이트 리밋을 인식합니다. 각 프로바이더의 일일 한도를 알고 있고,
KV 네임스페이스에 UTC 일자 기준 프로바이더별 요청 수를 기록합니다. 한도에
도달한 프로바이더는 자동으로 체인에서 제외되며, 다음 우선순위 프로바이더가
운영자 개입 없이 인계받습니다.

### 특징

- **3가지 라우팅 모드 동시 사용** — 기본 프로바이더 설정, 메시지별 prefix
  오버라이드, 모든 활성 프로바이더 병렬 비교.
- **API 키 게이팅** — 워커 시크릿 스토어에 키가 존재하는 프로바이더만
  활성화. Workers AI는 키 불필요로 항상 사용 가능.
- **일일 쿼터 추적** — 모든 디스패치마다 프로바이더별 카운터를 KV에
  증가시키고, 한도를 초과하면 라우트가 그 프로바이더를 건너뜀.
- **플랫폼 독립적 코어** — 파서/라우터/프로바이더 모듈은 텔레그램이나
  디스코드를 인식하지 않음. 어댑터가 인바운드 페이로드를 동일한 내부
  `Message` 형태로 변환.
- **양 플랫폼 owner 게이트** — 텔레그램은 `from.id` 불일치 시 무응답 드롭,
  디스코드는 ephemeral 에러로 거부. 웹훅 URL에 플랫폼별 시크릿 path 추가
  방어선.
- **사용자별 대화 이력** — 최근 턴(기본 10개)을 KV에 보관해 plain 메시지가
  실제 대화처럼 흐름. `/reset`으로 초기화.

### 3가지 모드

세 모드는 동시 사용 가능, 메시지별로 선택:

```
모드 A — 기본 프로바이더 설정:
    /ai groq          이후 plain 메시지는 Groq로 라우팅.

모드 B — prefix로 1회용 오버라이드:
    !gemini hello     이번 한 메시지만 Gemini가 응답. 기본 변경 없음.

모드 C — 모든 활성 프로바이더 비교:
    ? what is X       또는  /all what is X
    활성 프로바이더 전부 병렬 호출, 라벨로 구분된 응답 반환.
```

### 프로젝트 구조

```
llm-router-bot/
├── package.json              npm 스크립트: build / test / deploy / format
├── tsconfig.json             strict TS, allowImportingTsExtensions
├── wrangler.example.toml     Worker 설정 템플릿
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              fetch 핸들러, 라우트 디스패치
│   ├── types.ts              Env / Message / Provider / ParsedCommand
│   ├── parser.ts             텍스트 → ParsedCommand 순수 함수
│   ├── router.ts             모드 A/B/C 디스패치, 폴백 체인, 이력 저장
│   ├── format.ts             MarkdownV2 escape, 4096자 청킹
│   ├── kv.ts                 사용자 상태 + 이력 KV 헬퍼
│   ├── quota.ts              일일 카운터, isUnderQuota, snapshot
│   ├── platforms/
│   │   ├── telegram.ts       웹훅 핸들러, owner 게이트, sendMessage
│   │   └── discord.ts        Ed25519 검증, deferred 응답, /llm 명령
│   └── providers/
│       ├── index.ts          레지스트리, 우선순위, alias
│       ├── workers-ai.ts     env.AI 바인딩 (Llama 3.3 70B / 8B)
│       ├── groq.ts           Groq Llama 3.3 70B
│       ├── gemini.ts         Gemini 2.5 Flash + Pro
│       ├── openrouter.ts     DeepSeek R1 distill
│       ├── together.ts       Qwen 2.5 72B
│       └── hf.ts             HuggingFace router
├── test/                     parser / router / format 단위 테스트
└── .github/workflows/
    ├── build.yml             tsc + wrangler dry-run
    └── test.yml              prettier + tsc + vitest
```

### 빠른 시작

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test                 # 37개 단위 테스트
npm run build            # tsc 타입 체크

cp wrangler.example.toml wrangler.toml
# wrangler.toml 편집 → KV id, TG_OWNER_ID 입력
npx wrangler kv namespace create SESSIONS
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET
# 원하는 프로바이더 키도 wrangler secret put 으로 추가

npm run deploy
```

### 봇 명령

```
/help              사용법
/providers         프로바이더 목록 + 활성화 상태
/quota             오늘 프로바이더별 사용량 (UTC)
/history           최근 대화 턴
/reset             이력 + 기본 프로바이더 초기화
/ai <프로바이더>   모드 A: 기본 프로바이더 설정
/all <텍스트>      모드 C: 모든 프로바이더 병렬 호출
? <텍스트>         모드 C 단축형
!<프리픽스> <텍스트>  모드 B: 1회용 오버라이드
```

상세 설치/배포/환경 변수/FAQ는 [English](#english) 섹션을 참고하세요.

### 라이선스

MIT. [LICENSE](./LICENSE) 참조.

### 면책

본 프로젝트는 운영자 본인이 소유한 프로바이더 계정에 대한 개인용 도구입니다.
각 프로바이더의 이용약관 및 acceptable-use 정책 준수는 전적으로 운영자
본인의 책임이며, **본 워커를 공유 서비스로 배포하거나 제3자에게 노출하지
마십시오.**

---

## 日本語

### 概要

`llm-router-bot` は複数の大規模言語モデルの前に薄いルーティング層を置き、
その結果を Telegram ボットおよび(任意で)Discord ボットとして公開する
シングルユーザー向けの Cloudflare Worker です。すでに複数プロバイダの
API キーを所有している個人運用者が、毎回サービスを手動で選ぶ代わりに
一貫したフォールバックチェーンを使いたい場合に向いています。

ルーターはレート制限を意識します。各プロバイダの 1 日あたりの上限を
把握しており、KV 名前空間に UTC 日付単位でプロバイダ別のリクエスト数を
記録します。上限に達したプロバイダは自動的にチェーンから外され、次の
優先プロバイダが介入なしに引き継ぎます。

### 特徴

- **3 つのルーティングモードを同時に利用可能** — デフォルトプロバイダ設定、
  メッセージごとのプレフィックス上書き、全プロバイダ並列比較。
- **API キーゲーティング** — Worker のシークレットストアにキーがある
  プロバイダのみ有効化。Workers AI はキー不要で常時利用可能。
- **日次クォータ追跡** — ディスパッチごとに KV のプロバイダ別カウンタを
  増分し、上限を超えたプロバイダはスキップ。
- **プラットフォーム非依存のコア** — パーサ・ルーター・プロバイダモジュールは
  Telegram/Discord を一切知らない。
- **両プラットフォームのオーナーゲート** — 不正な user id は静かにドロップ。
- **ユーザーごとの会話履歴** — 直近のターン(既定 10)を KV に保持。

### プロジェクト構成

```
llm-router-bot/
├── package.json              npm スクリプト
├── tsconfig.json             strict TS
├── wrangler.example.toml     Worker 設定テンプレート
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              fetch ハンドラ
│   ├── types.ts              共有型
│   ├── parser.ts             コマンド/プレフィックスパーサ
│   ├── router.ts             モード A/B/C ディスパッチ
│   ├── format.ts             MarkdownV2 エスケープ + チャンク
│   ├── kv.ts                 ユーザー状態 + 履歴
│   ├── quota.ts              日次カウンタ
│   ├── platforms/{telegram,discord}.ts
│   └── providers/{index,workers-ai,groq,gemini,openrouter,together,hf}.ts
├── test/                     parser / router / format 単体テスト
└── .github/workflows/{build,test}.yml
```

詳細なインストール、設定、FAQ は [English](#english) を参照してください。

### ライセンス

MIT。[LICENSE](./LICENSE) を参照。

---

## 中文

### 概述

`llm-router-bot` 是一个单用户的 Cloudflare Worker,在多个大语言模型前面
放置一个薄路由层,并通过 Telegram 机器人和(可选的)Discord 机器人对外
暴露结果。适合已经持有多家提供商 API 密钥、希望使用一致回退链而不是每次
手动选择服务的个人运营者。

路由器具备速率限制感知:每个提供商都有已知的每日上限,Worker 在 KV 命名
空间中按 UTC 日期统计每个提供商的请求数。达到上限的提供商会自动从链中
移除,下一个优先级的提供商在无需干预的情况下接管。

### 特性

- **三种路由模式同时可用** — 设置默认提供商、按消息前缀覆盖、并行调用
  全部启用的提供商进行对比。
- **API 密钥门控** — 仅启用密钥已写入 Worker 密钥存储的提供商。Workers AI
  无需密钥,始终可用。
- **每日配额追踪** — 每次调度都会增加 KV 中按提供商计数的计数器,
  超额的提供商会被路由跳过。
- **平台无关的核心** — 解析器/路由器/提供商模块完全不感知 Telegram 或
  Discord;两个适配器把入站负载转换为同一个内部 `Message` 形态。
- **双平台 owner 门控** — Telegram 错误 `from.id` 静默丢弃,Discord
  错误用户用临时错误拒绝。
- **按用户保留会话历史** — 最近若干轮(默认 10)保存在 KV 中。

### 项目结构

```
llm-router-bot/
├── package.json              npm 脚本
├── tsconfig.json             严格 TS
├── wrangler.example.toml     Worker 配置模板
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              fetch 处理器
│   ├── types.ts              共享类型
│   ├── parser.ts             命令/前缀解析器
│   ├── router.ts             模式 A/B/C 分发
│   ├── format.ts             MarkdownV2 转义 + 分块
│   ├── kv.ts                 用户状态 + 历史
│   ├── quota.ts              日计数器
│   ├── platforms/{telegram,discord}.ts
│   └── providers/{index,workers-ai,groq,gemini,openrouter,together,hf}.ts
├── test/                     parser / router / format 单元测试
└── .github/workflows/{build,test}.yml
```

详细的安装、配置和常见问题请参见 [English](#english) 部分。

### 许可证

MIT。详见 [LICENSE](./LICENSE)。

---

## Русский

### Обзор

`llm-router-bot` — однопользовательский Cloudflare Worker, который
размещает тонкий маршрутизирующий слой перед несколькими большими языковыми
моделями и публикует результат как Telegram-бота и (опционально)
Discord-бота. Подходит для индивидуальных операторов, у которых уже есть
ключи API нескольких провайдеров и которые хотят использовать единую цепочку
резервных вариантов вместо ручного выбора каждый раз.

Маршрутизатор учитывает ограничения скорости: знает дневной потолок каждого
провайдера и считает запросы по провайдерам по UTC-дате в KV. Провайдер,
достигший потолка, автоматически выпадает из цепочки до полуночи UTC.

### Возможности

- **Три режима маршрутизации одновременно** — установка провайдера по
  умолчанию, разовое переопределение префиксом, параллельный опрос всех
  включённых провайдеров.
- **Допуск по ключу API** — провайдер включается только при наличии его
  ключа. Workers AI всегда доступен без ключа.
- **Учёт суточной квоты** — счётчик в KV по каждому провайдеру; при
  переполнении провайдер пропускается.
- **Платформо-независимое ядро** — парсер/маршрутизатор/провайдеры не знают
  про Telegram и Discord.
- **Шлюз владельца на обеих платформах** — несовпадение user id молча
  отбрасывается на Telegram, отклоняется на Discord.
- **История диалога по пользователю** — последние ходы (по умолчанию 10) в KV.

### Структура проекта

```
llm-router-bot/
├── package.json
├── tsconfig.json
├── wrangler.example.toml
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              обработчик fetch
│   ├── types.ts              общие типы
│   ├── parser.ts             парсер команд/префиксов
│   ├── router.ts             диспетчер режимов A/B/C
│   ├── format.ts             экранирование MarkdownV2 + чанки
│   ├── kv.ts                 состояние пользователя + история
│   ├── quota.ts              суточные счётчики
│   ├── platforms/{telegram,discord}.ts
│   └── providers/{index,workers-ai,groq,gemini,openrouter,together,hf}.ts
├── test/                     юнит-тесты parser / router / format
└── .github/workflows/{build,test}.yml
```

Подробные инструкции по установке, конфигурации и FAQ см. в разделе
[English](#english).

### Лицензия

MIT. См. [LICENSE](./LICENSE).

---

## Tiếng Việt

### Tổng quan

`llm-router-bot` là một Cloudflare Worker dành cho một người dùng, đặt một
lớp định tuyến mỏng trước nhiều mô hình ngôn ngữ lớn và phát hành kết quả
dưới dạng bot Telegram và (tuỳ chọn) bot Discord. Phù hợp với người vận
hành cá nhân đã sở hữu khoá API của nhiều nhà cung cấp và muốn dùng một
chuỗi dự phòng nhất quán thay vì chọn dịch vụ thủ công mỗi lần.

Bộ định tuyến nhận thức được giới hạn tốc độ: biết trần hằng ngày của mỗi
nhà cung cấp và đếm số yêu cầu theo nhà cung cấp theo ngày UTC trong KV.
Nhà cung cấp đạt trần sẽ tự động rời khỏi chuỗi cho đến nửa đêm UTC.

### Tính năng

- **Ba chế độ định tuyến đồng thời** — đặt nhà cung cấp mặc định, ghi đè
  một lần bằng tiền tố, gọi song song mọi nhà cung cấp đang bật.
- **Chặn theo khoá API** — nhà cung cấp chỉ được bật khi khoá của nó có
  trong kho secret. Workers AI luôn sẵn sàng không cần khoá.
- **Theo dõi hạn ngạch hằng ngày** — bộ đếm theo nhà cung cấp trong KV;
  vượt trần thì bị bỏ qua.
- **Nhân không phụ thuộc nền tảng** — parser/router/providers không biết
  về Telegram hay Discord.
- **Cổng owner trên cả hai nền tảng** — user id sai bị bỏ qua âm thầm
  trên Telegram, từ chối trên Discord.
- **Lịch sử hội thoại theo người dùng** — các lượt gần nhất (mặc định 10)
  trong KV.

### Cấu trúc dự án

```
llm-router-bot/
├── package.json
├── tsconfig.json
├── wrangler.example.toml
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              bộ xử lý fetch
│   ├── types.ts              kiểu dùng chung
│   ├── parser.ts             parser lệnh/tiền tố
│   ├── router.ts             phân phối chế độ A/B/C
│   ├── format.ts             escape MarkdownV2 + chia chunk
│   ├── kv.ts                 trạng thái người dùng + lịch sử
│   ├── quota.ts              bộ đếm hằng ngày
│   ├── platforms/{telegram,discord}.ts
│   └── providers/{index,workers-ai,groq,gemini,openrouter,together,hf}.ts
├── test/                     unit test parser / router / format
└── .github/workflows/{build,test}.yml
```

Hướng dẫn cài đặt, cấu hình và FAQ chi tiết có ở phần [English](#english).

### Giấy phép

MIT. Xem [LICENSE](./LICENSE).

---

## Türkçe

### Genel Bakış

`llm-router-bot`, birden çok büyük dil modelinin önüne ince bir yönlendirme
katmanı yerleştiren ve sonucu bir Telegram botu ile (isteğe bağlı olarak)
bir Discord botu olarak sunan tek kullanıcılı bir Cloudflare Worker'ıdır.
Birden çok sağlayıcının API anahtarına zaten sahip olan ve her seferinde
elle servis seçmek yerine tutarlı bir geri çekilme zinciri kullanmak isteyen
bireysel operatörler için tasarlanmıştır.

Yönlendirici hız sınırına duyarlıdır: her sağlayıcının günlük tavanını bilir
ve KV ad alanında UTC tarihine göre sağlayıcı başına istek sayar. Tavana
ulaşan sağlayıcı, UTC gece yarısına kadar zincirden otomatik olarak
çıkarılır.

### Özellikler

- **Aynı anda üç yönlendirme modu** — varsayılan sağlayıcı, mesaj başına
  önek ile geçici geçersiz kılma, tüm etkin sağlayıcıların paralel
  karşılaştırması.
- **API anahtarı kapısı** — yalnızca anahtarı mevcut sağlayıcılar etkin.
  Workers AI anahtarsız her zaman kullanılabilir.
- **Günlük kota takibi** — her gönderim KV'de sağlayıcı başına bir sayacı
  artırır; tavana ulaşan sağlayıcı atlanır.
- **Platformdan bağımsız çekirdek** — parser/router/providers, Telegram veya
  Discord'u bilmez.
- **Her iki platformda sahip kapısı** — yanlış user id Telegram'da sessizce
  düşürülür, Discord'da reddedilir.
- **Kullanıcı başına konuşma geçmişi** — KV'de son turlar (varsayılan 10).

### Proje yapısı

```
llm-router-bot/
├── package.json
├── tsconfig.json
├── wrangler.example.toml
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              fetch işleyici
│   ├── types.ts              ortak türler
│   ├── parser.ts             komut/önek ayrıştırıcısı
│   ├── router.ts             A/B/C modu yönlendirme
│   ├── format.ts             MarkdownV2 kaçışı + parçalama
│   ├── kv.ts                 kullanıcı durumu + geçmiş
│   ├── quota.ts              günlük sayaçlar
│   ├── platforms/{telegram,discord}.ts
│   └── providers/{index,workers-ai,groq,gemini,openrouter,together,hf}.ts
├── test/                     parser / router / format birim testleri
└── .github/workflows/{build,test}.yml
```

Ayrıntılı kurulum, yapılandırma ve SSS için [English](#english) bölümüne
bakın.

### Lisans

MIT. [LICENSE](./LICENSE) dosyasına bakın.

---

## Deutsch

### Überblick

`llm-router-bot` ist ein Single-User-Cloudflare-Worker, der eine dünne
Routing-Schicht vor mehrere große Sprachmodelle setzt und das Ergebnis als
Telegram- und (optional) Discord-Bot bereitstellt. Ausgelegt für individuelle
Betreiber, die bereits API-Schlüssel mehrerer Anbieter haben und eine
konsistente Fallback-Kette statt manueller Auswahl jeder Anfrage wünschen.

Der Router ist rate-limit-bewusst: er kennt das Tageslimit jedes Anbieters
und zählt Anfragen pro Anbieter pro UTC-Tag in einer KV-Namensraum. Anbieter,
die ihr Limit erreicht haben, fallen bis Mitternacht UTC automatisch aus
der Kette.

### Funktionen

- **Drei Routing-Modi gleichzeitig** — Standardanbieter setzen, einmalige
  Präfix-Überschreibung, paralleler Vergleich aller aktivierten Anbieter.
- **API-Key-Gating** — Anbieter werden nur aktiviert, wenn ihr Schlüssel im
  Secret-Store vorhanden ist. Workers AI ohne Schlüssel immer verfügbar.
- **Tägliche Kontingent-Verfolgung** — pro Anbieter Zähler in KV; bei
  Überschreitung wird der Anbieter übersprungen.
- **Plattform-agnostischer Kern** — Parser/Router/Provider kennen weder
  Telegram noch Discord.
- **Eigentümer-Gate auf beiden Plattformen** — falsche user id wird auf
  Telegram still verworfen, auf Discord abgelehnt.
- **Konversationsverlauf pro Nutzer** — letzte Runden (Standard 10) in KV.

### Projektstruktur

```
llm-router-bot/
├── package.json
├── tsconfig.json
├── wrangler.example.toml
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              fetch-Handler
│   ├── types.ts              gemeinsame Typen
│   ├── parser.ts             Befehls-/Präfix-Parser
│   ├── router.ts             Modus-A/B/C-Dispatch
│   ├── format.ts             MarkdownV2-Escape + Chunking
│   ├── kv.ts                 Nutzerstatus + Verlauf
│   ├── quota.ts              Tageszähler
│   ├── platforms/{telegram,discord}.ts
│   └── providers/{index,workers-ai,groq,gemini,openrouter,together,hf}.ts
├── test/                     Unit-Tests parser / router / format
└── .github/workflows/{build,test}.yml
```

Ausführliche Installations-, Konfigurations- und FAQ-Anleitungen findest
du im Abschnitt [English](#english).

### Lizenz

MIT. Siehe [LICENSE](./LICENSE).

---

## Español

### Descripción general

`llm-router-bot` es un Cloudflare Worker de un solo usuario que coloca una
fina capa de enrutamiento delante de varios modelos de lenguaje grandes y
expone el resultado como un bot de Telegram y (opcionalmente) un bot de
Discord. Está pensado para operadores personales que ya tienen claves API
de varios proveedores y quieren una cadena de respaldo coherente en lugar
de elegir manualmente cada vez.

El enrutador es consciente del límite de velocidad: conoce el techo diario
de cada proveedor y cuenta las solicitudes por proveedor y por fecha UTC en
un espacio de nombres KV. El proveedor que alcanza su techo se elimina
automáticamente de la cadena hasta la medianoche UTC.

### Características

- **Tres modos de enrutamiento simultáneos** — proveedor predeterminado,
  anulación por prefijo en un mensaje, comparación paralela de todos los
  proveedores activos.
- **Compuerta por clave API** — solo se habilitan los proveedores cuya clave
  está en el almacén de secretos. Workers AI siempre disponible sin clave.
- **Seguimiento de cuota diaria** — cada despacho incrementa un contador
  por proveedor en KV; al superar el techo se omite.
- **Núcleo independiente de plataforma** — parser/enrutador/proveedores no
  conocen ni Telegram ni Discord.
- **Compuerta de propietario en ambas plataformas** — id incorrecto se
  descarta silenciosamente en Telegram, se rechaza en Discord.
- **Historial de conversación por usuario** — últimos turnos (10 por defecto)
  en KV.

### Estructura del proyecto

```
llm-router-bot/
├── package.json
├── tsconfig.json
├── wrangler.example.toml
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              manejador de fetch
│   ├── types.ts              tipos compartidos
│   ├── parser.ts             parser de comandos/prefijos
│   ├── router.ts             despacho de modos A/B/C
│   ├── format.ts             escape MarkdownV2 + chunking
│   ├── kv.ts                 estado de usuario + historial
│   ├── quota.ts              contadores diarios
│   ├── platforms/{telegram,discord}.ts
│   └── providers/{index,workers-ai,groq,gemini,openrouter,together,hf}.ts
├── test/                     pruebas unitarias parser / router / format
└── .github/workflows/{build,test}.yml
```

Para instrucciones detalladas de instalación, configuración y FAQ, consulta
la sección [English](#english).

### Licencia

MIT. Consulta [LICENSE](./LICENSE).

---

## Português

### Visão geral

`llm-router-bot` é um Cloudflare Worker de usuário único que coloca uma
fina camada de roteamento na frente de vários modelos de linguagem grandes
e expõe o resultado como um bot do Telegram e (opcionalmente) um bot do
Discord. Pensado para operadores pessoais que já possuem chaves de API de
vários provedores e querem uma cadeia de fallback coerente em vez de
escolher o serviço manualmente toda vez.

O roteador é consciente de limites de taxa: conhece o teto diário de cada
provedor e conta requisições por provedor e por data UTC em um espaço de
nomes KV. O provedor que atinge o teto é removido automaticamente da cadeia
até a meia-noite UTC.

### Recursos

- **Três modos de roteamento simultâneos** — provedor padrão, substituição
  por prefixo em uma mensagem, comparação paralela de todos os provedores
  ativos.
- **Portão por chave de API** — apenas provedores cujas chaves estão no
  armazenamento de segredos são habilitados. Workers AI sempre disponível
  sem chave.
- **Rastreamento de cota diária** — cada despacho incrementa um contador
  por provedor no KV; ao ultrapassar o teto, é ignorado.
- **Núcleo independente de plataforma** — parser/roteador/provedores não
  conhecem Telegram nem Discord.
- **Portão de proprietário em ambas as plataformas** — id incorreto é
  descartado silenciosamente no Telegram, recusado no Discord.
- **Histórico de conversa por usuário** — últimos turnos (10 por padrão)
  no KV.

### Estrutura do projeto

```
llm-router-bot/
├── package.json
├── tsconfig.json
├── wrangler.example.toml
├── README.md / LICENSE / CHANGELOG.md
├── src/
│   ├── index.ts              manipulador de fetch
│   ├── types.ts              tipos compartilhados
│   ├── parser.ts             parser de comandos/prefixos
│   ├── router.ts             despacho de modos A/B/C
│   ├── format.ts             escape MarkdownV2 + chunking
│   ├── kv.ts                 estado do usuário + histórico
│   ├── quota.ts              contadores diários
│   ├── platforms/{telegram,discord}.ts
│   └── providers/{index,workers-ai,groq,gemini,openrouter,together,hf}.ts
├── test/                     testes unitários parser / router / format
└── .github/workflows/{build,test}.yml
```

Para instruções detalhadas de instalação, configuração e FAQ, consulte a
seção [English](#english).

### Licença

MIT. Veja [LICENSE](./LICENSE).
