<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <strong>🇰🇷 한국어</strong> · <a href="./zh-CN.md">🇨🇳 中文</a> · <a href="./es.md">🇪🇸 Español</a> · <a href="./hi.md">🇮🇳 हिन्दी</a><br />
  <a href="./ar.md">🇸🇦 العربية</a> · <a href="./pt-BR.md">🇧🇷 Português</a> · <a href="./ru.md">🇷🇺 Русский</a> · <a href="./fr.md">🇫🇷 Français</a> · <a href="./id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> 단일 Cloudflare Worker에서 텔레그램 및 디스코드 봇을 프런팅하는 다중 프로바이더 LLM 라우터.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### 개요

`llm-router-bot`은 여러 대형 언어 모델 앞에 얇은 라우팅 계층을 두고, 그 결과를 텔레그램 봇과 (선택적으로) 디스코드 봇으로 노출하는 단일 사용자용 Cloudflare Worker입니다. 여러 프로바이더의 API 키를 이미 가지고 있는 개인 운영자가, 매번 서비스를 직접 고르는 대신 일관된 폴백 체인을 쓰고 싶을 때 적합합니다.

라우터는 레이트 리밋(요청 제한)을 지능적으로 인식합니다. 각 프로바이더의 일일 한도를 알고 있고, KV 네임스페이스에 UTC 일자 기준 프로바이더별 요청 수를 기록합니다. 한도에 도달한 프로바이더는 자동으로 체인에서 제외되며, 다음 우선순위 프로바이더가 운영자 개입 없이 인계받습니다.

### 특징

- **3가지 라우팅 모드 동시 사용** — 기본 프로바이더 설정, 메시지별 접두사(prefix) 오버라이드, 모든 활성 프로바이더 병렬 호출 비교.
- **API 키 게이팅** — 워커의 시크릿 스토어에 API 키가 존재하는 프로바이더만 활성화. Workers AI는 키 없이 상시 활성화.
- **일일 쿼터 추적** — 모든 디스패치마다 프로바이더별 카운터를 KV에 증가시키고, 한도를 초과하면 라우트가 해당 프로바이더를 건너뜀.
- **플랫폼 독립적 코어** — 파서, 라우터, 프로바이더 모듈은 텔레그램이나 디스코드를 직접 인식하지 않음. 어댑터가 인바운드 페이로드를 동일한 내부 `Message` 규격으로 변환.
- **양 플랫폼 소유자(Owner) 게이트** — 텔레그램은 `from.id` 불일치 시 무응답 드롭, 디스코드는 ephemeral 에러로 거부. 웹훅 URL에 플랫폼별 시크릿 경로를 추가하여 심층 방어.
- **사용자별 대화 이력 보존** — 최근 대화 턴(기본값 10개)을 KV에 보관하여 일반 대화가 자연스럽게 이어짐. `/reset` 명령어로 초기화 가능.

### 3가지 모드

세 가지 모드는 언제든 동시에 사용 가능하며, 메시지마다 원하는 방식을 선택할 수 있습니다:

```
모드 A — 기본 프로바이더 설정:
    /ai groq          이후 일반 메시지는 Groq로 자동 라우팅.

모드 B — 접두사(prefix)로 1회성 오버라이드:
    !gemini hello     이번 한 메시지만 Gemini가 응답 (기본 설정 유지).

모드 C — 모든 활성 프로바이더 병렬 비교:
    ? what is X       또는  /all what is X
    활성화된 모든 프로바이더를 병렬 호출하여 레이블로 구분된 응답 반환.
```

명령어나 접두사가 없는 일반 텍스트는 사용자의 현재 기본 프로바이더로 라우팅되며, 기본값이 설정되지 않은 경우 자동 폴백 체인을 순서대로 시도합니다.

### 아키텍처

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

### 프로젝트 구조

```
llm-router-bot/
├── package.json              npm 스크립트: build (tsc), test (vitest), deploy, format
├── tsconfig.json             strict TS, allowImportingTsExtensions, noEmit
├── wrangler.example.toml     Cloudflare Worker 설정 템플릿
├── README.md                 영문 메인 문서
├── LICENSE                   MIT 라이선스
├── CHANGELOG.md              버전 변경 이력
├── docs/locales/             다국어 문서 (ko, zh-CN, es, hi, ar, pt-BR, ru, fr, id)
├── src/
│   ├── index.ts              fetch 핸들러 (/, /tg/<secret>, /interactions 라우트)
│   ├── types.ts              Env, Message, Provider, ParsedCommand 타입 정의
│   ├── parser.ts             순수 함수 파서 (슬래시 명령, ! 접두사, ? 비교, 일반 텍스트)
│   ├── router.ts             모드 A/B/C 디스패치, 폴백 체인 구성, 대화 이력 저장
│   ├── format.ts             텔레그램 MarkdownV2 이스케이프, 디스코드 이스케이프, 4096자 청킹
│   ├── kv.ts                 사용자 상태(기본 프로바이더 및 대화 이력) KV 헬퍼
│   ├── quota.ts              프로바이더별 일일 카운터, isUnderQuota, 쿼터 스냅샷
│   ├── platforms/
│   │   ├── telegram.ts       웹훅 핸들러, 소유자 게이트, MarkdownV2 청킹 전송
│   │   └── discord.ts        인터랙션 핸들러, Ed25519 검증, deferred 응답, /llm 슬래시 명령
│   └── providers/
│       ├── index.ts          프로바이더 레지스트리, 우선순위, 접두사 별칭(alias)
│       ├── workers-ai.ts     Cloudflare env.AI 바인딩 (Llama 3.3 70B 및 8B)
│       ├── groq.ts           Groq Chat Completions (Llama 3.3 70B)
│       ├── gemini.ts         Google AI Studio (Gemini 2.5 Flash 및 Pro)
│       ├── openrouter.ts     OpenRouter (DeepSeek R1 distill 추론)
│       ├── together.ts       Together AI (Qwen 2.5 72B 다국어 특화)
│       └── hf.ts             HuggingFace router (Llama 3.3 70B 보조 폴백)
├── test/
│   ├── parser.test.ts        18개 단위 테스트 (명령어, 접두사, 비교 단축키 등)
│   ├── router.test.ts        9개 단위 테스트 (제어 명령, KV 기록, 키 누락 거절 등)
│   └── format.test.ts        10개 단위 테스트 (MarkdownV2 이스케이프, 청킹 경계 등)
└── .github/workflows/
    ├── build.yml             tsc + wrangler deploy --dry-run
    └── test.yml              prettier --check + tsc + vitest
```

### 프로바이더 카탈로그

기본 우선순위 순서입니다. 워커의 시크릿 스토어에 해당 프로바이더의 API 키가 존재할 때만 런타임에 활성화되며, `Workers AI`만 키 없이 상시 활성화됩니다.

| # | ID | 모델 | 일일 한도 | 비고 |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14,400 | 고속 주력 모델 |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10,000 | API 키 불필요 (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | 고품질 폴백 |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | 추론 특화 |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10,000 | 경량 폴백 |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | 다국어 특화 |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1,000 | 보조 폴백 |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | 고난도 추론 전용 |

`!` 및 `/ai`에 사용할 수 있는 접두사 별칭(alias): `groq`, `gemini`, `gemini-pro`, `deepseek` / `r1`, `qwen` / `together`, `hf`, `workers-ai` / `cf`, `workers-70b`, `workers-8b`, `pro`.

### 호환성

| 항목 | 지원 규격 |
|---|---|
| 워커 런타임 | Cloudflare Workers (`compatibility_date = 2026-01-01`) |
| Node 툴체인 | 로컬 개발 및 CI용 Node 22+ (`wrangler 4.x` 필수 요구사항) |
| TypeScript | 5.7+ (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) |
| 텔레그램 | Bot API 웹훅, `MarkdownV2` 파싱 모드 |
| 디스코드 | Interactions API v10, Ed25519 서명 검증 |
| KV 네임스페이스 | `SESSIONS` 바인딩 1개 |
| AI 바인딩 | `[ai] binding = "AI"` |

본 워커는 플랫폼에 독립적입니다. Node.js 전용 의존성 없이 표준 Cloudflare Workers 런타임에서 동작합니다. 모든 HTTP 통신은 전역 `fetch`, 모든 암호화 검증은 `crypto.subtle`을 사용합니다.

### 보안 고려사항

- **단일 사용자 게이트** — 모든 인바운드 메시지는 `TG_OWNER_ID`(텔레그램) 또는 `DISCORD_OWNER_ID`(디스코드)와 대조하여 불일치 시 즉시 차단합니다. 텔레그램은 무응답 드롭, 디스코드는 ephemeral 에러로 거부합니다.
- **텔레그램 경로 시크릿** — 웹훅 URL 경로(`/tg/<TG_WEBHOOK_SECRET>`)가 일치하지 않으면 요청 본문을 읽기도 전에 즉시 `403`을 반환하므로 무차별 외부 호출 비용이 전혀 발생하지 않습니다.
- **디스코드 Ed25519 서명 검증** — 모든 인터랙션 요청을 애플리케이션 공개키와 대조하여 `crypto.subtle.verify`로 서명 검증하며, 위조 요청은 즉시 `401`을 반환합니다.
- **안전한 시크릿 보관** — API 키는 `wrangler secret put <이름>` 명령어로 Cloudflare 암호화 저장소에 등록되며 소스코드에 커밋되지 않습니다. `wrangler.toml` 역시 `.gitignore`에 등록됩니다.
- **원격 텔레메트리 없음** — 프로바이더 API, 텔레그램, 디스코드 외에 제3자 원격지로 어떠한 데이터도 전송하지 않습니다.
- **사용자별 대화 격리** — 대화 이력은 `user:<platform>:<userId>` 키로 저장되며 다른 사용자와 공유되지 않습니다.

### 문제 해결

| 증상 | 주요 원인 | 해결 방법 |
|---|---|---|
| 텔레그램 봇 무응답 | 웹훅 URL 오타 또는 `TG_OWNER_ID` 불일치 | `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` 확인 및 본인 숫자 ID 일치 여부 확인 |
| 웹훅 `403` 반환 | 웹훅 URL 시크릿 불일치 | `TG_WEBHOOK_SECRET`과 일치하는 비밀값으로 `setWebhook` 재실행 |
| 디스코드 슬래시 명령 실패 ("interaction failed") | Ed25519 공개키 불일치 또는 3초 초과 | `DISCORD_PUBLIC_KEY` 시크릿 확인 및 워커 로그에서 지연 응답(deferred response) 정상 여부 확인 |
| `All providers failed` 응답 | 활성화된 모든 프로바이더 에러 또는 일일 쿼터 소진 | `/quota` 명령어로 사용량 확인 후 UTC 자정 리셋 대기 또는 새 프로바이더 키 추가 |
| `/ai groq` 입력 시 "not currently enabled" | `GROQ_API_KEY` 시크릿 미설정 | `npx wrangler secret put GROQ_API_KEY` 실행 후 재배포 |
| 전체 비교 시 응답 섹션이 적음 | 대부분의 프로바이더 API 키가 미등록 상태 | `/providers`로 활성화 상태 확인 후 필요한 프로바이더 키 추가 등록 |

### 설치 및 배포

#### 1. 사전 준비

- Cloudflare 계정
- 로컬 환경의 Node.js 22+ 및 npm
- [@BotFather](https://t.me/BotFather)에서 발급받은 텔레그램 봇 토큰 및 운영자의 숫자 사용자 ID
- (선택 사항) 디스코드 애플리케이션 ID 및 Ed25519 공개키
- (선택 사항) Groq, Google AI Studio (Gemini), OpenRouter, Together AI, HuggingFace API 키 (키가 없어도 Workers AI만으로 동작 가능)

#### 2. 저장소 클론 및 패키지 설치

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build
```

#### 3. KV 네임스페이스 생성

```bash
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
```

출력된 `id`와 `preview_id`를 복사해둡니다.

#### 4. 설정 파일 준비

```bash
cp wrangler.example.toml wrangler.toml
# wrangler.toml을 열어 KV id, TG_OWNER_ID를 입력하고, 필요 시 DISCORD_OWNER_ID, DISCORD_APP_ID 설정
```

#### 5. 시크릿 키 설정

```bash
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET     # 임의의 안전한 비밀 문자열

# 활성화할 프로바이더 API 키 등록 (선택):
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put TOGETHER_API_KEY
npx wrangler secret put HF_API_KEY

# 디스코드를 사용할 경우 (선택):
npx wrangler secret put DISCORD_PUBLIC_KEY
```

#### 6. 배포

```bash
npm run deploy
# 배포 완료 후 출력되는 워커 URL: https://llm-router-bot.<subdomain>.workers.dev
```

#### 7. 플랫폼 웹훅 연동

텔레그램 웹훅 등록:

```bash
curl -X POST "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
     -d "url=https://llm-router-bot.<subdomain>.workers.dev/tg/<TG_WEBHOOK_SECRET>"
```

디스코드 연동:
1. 디스코드 개발자 포털의 Interactions Endpoint URL에 아래 URL을 등록:
   ```
   https://llm-router-bot.<subdomain>.workers.dev/interactions
   ```
2. `/llm` 슬래시 명령어 1회 등록:
   ```bash
   curl -X POST "https://discord.com/api/v10/applications/<DISCORD_APP_ID>/commands" \
        -H "Authorization: Bot <DISCORD_BOT_TOKEN>" \
        -H "content-type: application/json" \
        -d '{"name":"llm","description":"Talk to the LLM router","options":[{"name":"message","description":"Your message","type":3,"required":true}]}'
   ```

### 봇 명령어 안내

배포 후 텔레그램 대화창(또는 디스코드 `/llm message:<텍스트>`)에 전송할 수 있는 명령어입니다:

```
/help              도움말 및 사용법 표시
/providers         프로바이더 목록 및 활성화 상태 확인
/quota             오늘의 프로바이더별 사용량 확인 (UTC 기준)
/history           최근 대화 기록 표시
/reset             저장된 대화 기록 및 기본 프로바이더 설정 초기화
/ai <프로바이더>   모드 A: 기본 프로바이더 설정 (예: /ai groq)
/all <텍스트>      모드 C: 모든 활성 프로바이더 병렬 호출 비교
? <텍스트>         모드 C 단축 명령어
!<접두사> <텍스트> 모드 B: 1회성 오버라이드 (예: !gemini 안녕)
<일반 텍스트>      기본 프로바이더 또는 자동 폴백 체인 순서로 응답
```

### 환경 설정 변수

| 변수명 | 설정 위치 | 설명 |
|---|---|---|
| `TG_OWNER_ID` | `[vars]` | 필수. 허용할 텔레그램 숫자 사용자 ID |
| `TG_BOT_TOKEN` | secret | 필수. BotFather에서 발급받은 텔레그램 봇 토큰 |
| `TG_WEBHOOK_SECRET` | secret | 필수. 웹훅 URL 경로에 사용할 무작위 비밀 문자열 |
| `DISCORD_OWNER_ID` | `[vars]` | 선택. 허용할 디스코드 사용자 ID |
| `DISCORD_APP_ID` | `[vars]` | 선택. 디스코드 애플리케이션 ID |
| `DISCORD_PUBLIC_KEY` | secret | 선택. 디스코드 Ed25519 공개키 |
| `GROQ_API_KEY` | secret | 선택. `groq` 프로바이더 활성화 키 |
| `GEMINI_API_KEY` | secret | 선택. `gemini-flash` 및 `gemini-pro` 활성화 키 |
| `OPENROUTER_API_KEY` | secret | 선택. `deepseek-r1` 프로바이더 활성화 키 |
| `TOGETHER_API_KEY` | secret | 선택. `together-qwen` 프로바이더 활성화 키 |
| `HF_API_KEY` | secret | 선택. `hf` 프로바이더 활성화 키 |
| `DISABLED_PROVIDERS` | `[vars]` | 선택. 제외할 프로바이더 ID 목록 (쉼표 구분) |
| `HISTORY_TURNS` | `[vars]` | 선택. 사용자별 유지할 대화 턴 수 (기본값 10) |

### 자주 묻는 질문 (FAQ)

**Q. 왜 단일 모델 대신 라우터를 사용하나요?**
A. 모델마다 특화 영역과 일일 무료 한도가 다릅니다. 라우터를 사용하면 복잡한 추론에는 소량의 프리미엄 쿼터(Gemini Pro, DeepSeek R1)를 아끼고, 일상적인 대화에는 넉넉한 쿼터(Groq, Workers AI)를 활용할 수 있습니다.

**Q. 대화 이력은 어디에 저장되나요?**
A. `SESSIONS` KV 네임스페이스의 `user:<platform>:<userId>` 키 아래에 저장됩니다. 윈도우 크기는 `HISTORY_TURNS`(기본값 10)이며, `/reset` 실행 시 즉시 삭제됩니다.

**Q. 일일 쿼터는 어떻게 계산되나요?**
A. 디스패치 발생 시마다 KV에 `quota:<providerId>:<YYYY-MM-DD>` 카운터를 갱신합니다. 36시간 TTL이 적용되어 전날 사용량도 조회 가능합니다.

**Q. 새로운 프로바이더를 추가할 수 있나요?**
A. `src/providers/` 아래에 `Provider` 인터페이스를 구현하는 새 파일을 작성하고, `src/providers/index.ts`의 `ALL_PROVIDERS` 및 `PREFIX_ALIASES`에 등록하면 라우터 코드 수정 없이 즉시 연동됩니다.

### 라이선스

MIT. 자세한 내용은 [LICENSE](../../LICENSE)를 참조하세요.

### 면책 조항

본 프로젝트는 운영자 본인이 직접 소유한 프로바이더 계정에 대한 개인용 관리 도구입니다. 각 프로바이더의 서비스 이용약관 및 정책 준수 책임은 전적으로 운영자에게 있으며, **본 워커를 공용 서비스로 배포하거나 제3자에게 임의로 노출하지 마십시오.**
