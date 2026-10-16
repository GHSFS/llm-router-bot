<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <a href="./ko.md">🇰🇷 한국어</a> · <strong>🇨🇳 中文</strong> · <a href="./es.md">🇪🇸 Español</a> · <a href="./hi.md">🇮🇳 हिन्दी</a><br />
  <a href="./ar.md">🇸🇦 العربية</a> · <a href="./pt-BR.md">🇧🇷 Português</a> · <a href="./ru.md">🇷🇺 Русский</a> · <a href="./fr.md">🇫🇷 Français</a> · <a href="./id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> 基于单个 Cloudflare Worker 的多提供商 LLM 路由器，同时接入 Telegram 与 Discord 机器人。

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### 概述

`llm-router-bot` 是一个面向单用户的 Cloudflare Worker，在多个大语言模型（LLM）前面放置一层精简的路由层，并将结果通过 Telegram 机器人和（可选的）Discord 机器人对外提供服务。它专门为已持有多家模型提供商 API 密钥、希望获得一致的自动故障回退链而非每次手动切换服务的个人运营者设计。

该路由器具备速率限制感知能力：清楚掌握各提供商的每日额度上限，并在 KV 命名空间中按 UTC 日期记录每个提供商的请求量。一旦某提供商达到上限，将自动从回退链中临时移除，直到 UTC 午夜重置，后续优先级的提供商将在无人工干预的情况下无缝接管。

### 特性

- **三种路由模式并存** — 支持设置默认提供商、单条消息前缀覆盖，以及并行调用全部启用的提供商进行多模型对比。
- **API 密钥门控机制** — 仅在 Worker 的 Secrets 存储中检测到有效密钥时才启用对应提供商。Workers AI 免密钥常驻可用。
- **每日配额精确追踪** — 每次调度均在 KV 中递增提供商专属计数器；超额提供商自动被路由跳过。
- **与平台解耦的抽象核心** — 解析器、路由器和提供商模块完全不依赖 Telegram 或 Discord。平台适配器负责将不同入站负载统一转换为标准的内部 `Message` 结构。
- **双平台所有者（Owner）鉴权** — Telegram 收到非本人 `from.id` 请求时静默丢弃；Discord 收到非本人用户交互时返回临时错误。Webhook URL 包含路径密钥以实现深度防御。
- **按用户隔离的对话上下文** — 在 KV 中保存最近若干轮对话历史（默认 10 轮），使日常交互自然流畅。支持通过 `/reset` 随时清除。

### 三种模式

三种路由模式完全并存，用户可在每条消息中灵活选用：

```
模式 A — 设置默认提供商:
    /ai groq          后续普通消息均默认路由至 Groq。

模式 B — 前缀单次覆盖:
    !gemini hello     仅本条消息由 Gemini 响应（不改变全局默认配置）。

模式 C — 多提供商并行对比:
    ? what is X       或  /all what is X
    同时向所有已启用的提供商发起并发请求，并返回带标签的聚合回答。
```

无前缀且无控制指令的普通消息将发送至当前默认提供商；若未设置默认提供商，则沿自动回退链依次调用。

### 系统架构

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

### 项目结构

```
llm-router-bot/
├── package.json              npm 脚本: build (tsc), test (vitest), deploy, format
├── tsconfig.json             严格 TS 配置，启用 allowImportingTsExtensions
├── wrangler.example.toml     Worker 配置文件模板
├── README.md                 英文核心说明文档
├── LICENSE                   MIT 许可证
├── CHANGELOG.md              版本演进记录
├── docs/locales/             多语言本地化文档库
├── src/
│   ├── index.ts              fetch 统一入口处理器 (/, /tg/<secret>, /interactions)
│   ├── types.ts              Env, Message, Provider, ParsedCommand 类型定义
│   ├── parser.ts             纯函数解析器（处理斜杠指令、! 前缀、? 对比与普通文本）
│   ├── router.ts             A/B/C 模式分发调度、回退链构建与历史上下文存储
│   ├── format.ts             Telegram MarkdownV2 转义、Discord 转义、4096 字符智能分块
│   ├── kv.ts                 用户状态及历史会话 KV 辅助工具
│   ├── quota.ts              提供商日配额计数器、isUnderQuota 校验与快照
│   ├── platforms/
│   │   ├── telegram.ts       Webhook 适配器、Owner 鉴权门禁、MarkdownV2 分块回发
│   │   └── discord.ts        Interactions 适配器、Ed25519 验签、延时响应、/llm 命令
│   └── providers/
│       ├── index.ts          提供商注册表、优先级定义、别名映射 (PREFIX_ALIASES)
│       ├── workers-ai.ts     Cloudflare env.AI 绑定 (Llama 3.3 70B & 8B)
│       ├── groq.ts           Groq Chat Completions (Llama 3.3 70B)
│       ├── gemini.ts         Google AI Studio (Gemini 2.5 Flash & Pro)
│       ├── openrouter.ts     OpenRouter (DeepSeek R1 distill 推理模型)
│       ├── together.ts       Together AI (Qwen 2.5 72B 多语言模型)
│       └── hf.ts             HuggingFace router (Llama 3.3 70B 备用回退)
├── test/
│   ├── parser.test.ts        18 个单元测试用例（覆盖指令、前缀与边界条件）
│   ├── router.test.ts        9 个单元测试用例（覆盖控制流、KV 写入与未授权拦截）
│   └── format.test.ts        10 个单元测试用例（覆盖 MarkdownV2 转义与分块截断）
└── .github/workflows/
    ├── build.yml             tsc 编译检查 + wrangler deploy --dry-run
    └── test.yml              prettier 检查 + tsc + vitest 自动化测试
```

### 提供商目录

以下为默认优先级次序。提供商仅在 Worker 密码存储区中配置了相应 API 密钥时动态启用；`Workers AI` 作为无需密钥的常备兜底项始终可用。

| # | ID | 模型 | 每日上限 | 备注 |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14,400 | 超高速主力模型 |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10,000 | 无需 API 密钥 (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | 高质量主力回退 |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | 深度逻辑推理模型 |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10,000 | 轻量级兜底模型 |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | 多语言增强模型 |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1,000 | 辅助备用回退 |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | 复杂任务专用推理模型 |

支持在 `!` 与 `/ai` 指令中使用的前缀别名：`groq`, `gemini`, `gemini-pro`, `deepseek` / `r1`, `qwen` / `together`, `hf`, `workers-ai` / `cf`, `workers-70b`, `workers-8b`, `pro`。

### 兼容性规范

| 维度 | 支持规范 |
|---|---|
| Worker 运行时 | Cloudflare Workers (`compatibility_date = 2026-01-01`) |
| Node 工具链 | 本地开发及 CI 需 Node 22+ (`wrangler 4.x` 强制要求) |
| TypeScript | 5.7+ (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) |
| Telegram | Bot API Webhook, `MarkdownV2` 解析模式 |
| Discord | Interactions API v10, Ed25519 签名验证 |
| KV 命名空间 | 绑定至 `SESSIONS` 的单个 KV 空间 |
| AI 绑定 | `[ai] binding = "AI"` |

本项目代码与运行平台保持解耦，基于标准 Cloudflare Workers 运行时开发，无特定 Node.js 运行时依赖。所有网络请求均采用全局标准 `fetch`，所有加解密操作均基于 `crypto.subtle`。

### 安全考量

- **单用户鉴权隔离** — 所有入站消息均由 `TG_OWNER_ID`（Telegram）或 `DISCORD_OWNER_ID`（Discord）严格核验，非本人请求直接丢弃或拒绝，杜绝未经授权的算力消耗。
- **Telegram 专属路径密钥** — Webhook 路径为 `/tg/<TG_WEBHOOK_SECRET>`。路径不匹配时在读取请求体之前立即返回 `403`，免受外部扫描打扰。
- **Discord Ed25519 验签** — 对接收到的每条交互请求通过 `crypto.subtle.verify` 校验签名，未签名或伪造签名直接返回 `401`。
- **密钥零明文托管** — API 密钥通过 `wrangler secret put <NAME>` 直接存入 Cloudflare 加密凭据存储区，代码库中不包含任何密钥。`wrangler.toml` 亦列入 `.gitignore`。
- **零遥测与隐私保护** — 除调用指定模型 API、Telegram 及 Discord 回发响应外，绝不向任何第三方上报遥测数据。
- **会话独立隔离** — 历史记录以 `user:<platform>:<userId>` 维度存储，不存在跨用户数据共享。

### 故障排除

| 现象 | 可能原因 | 解决方案 |
|---|---|---|
| Telegram 机器人无响应 | Webhook 填写有误或 `from.id` 不等于 `TG_OWNER_ID` | 请求 `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` 检查状态，并核对本人数字 ID |
| Webhook 返回 403 | Webhook URL 中的 secret 与 Worker 配置不一致 | 使用与 `TG_WEBHOOK_SECRET` 一致的字符串重新调用 `setWebhook` |
| Discord 斜杠指令提示 "interaction failed" | Ed25519 公钥不匹配或 Worker 响应耗时超 3 秒 | 确认 `DISCORD_PUBLIC_KEY` 与应用一致；检查 Worker 日志确认延时响应流程 |
| 返回 `All providers failed` | 所有启用模型发生异常或已达单日配额上限 | 发送 `/quota` 查看今日用量，等待 UTC 午夜重置或添加新的可用模型密钥 |
| `/ai groq` 提示 "not currently enabled" | 未注入 `GROQ_API_KEY` 凭据 | 执行 `npx wrangler secret put GROQ_API_KEY` 并重新部署 |
| 并行对比仅返回极少数模型的回答 | 大多数提供商未配置 API 密钥 | 发送 `/providers` 查看启用状态，为需要参与对比的模型配置相应密钥 |

### 安装与部署

#### 1. 前置准备

- Cloudflare 账号
- 本地 Node.js 22+ 及 npm
- 由 [@BotFather](https://t.me/BotFather) 创建的 Telegram 机器人 Token 及管理员个人数字 ID
- （可选）Discord 开发者门户中的 Application ID 及 Ed25519 Public Key
- （可选）Groq、Google AI Studio (Gemini)、OpenRouter、Together AI、HuggingFace API 密钥（即使不配置任何外部密钥，系统仍可仅基于 Workers AI 正常运转）

#### 2. 克隆项目与安装依赖

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build
```

#### 3. 创建 KV 命名空间

```bash
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
```

保存控制台打印的 `id` 与 `preview_id`。

#### 4. 配置 Worker 参数

```bash
cp wrangler.example.toml wrangler.toml
# 编辑 wrangler.toml: 填入上述 KV id，设置 TG_OWNER_ID，按需配置 DISCORD_OWNER_ID 与 DISCORD_APP_ID
```

#### 5. 写入加密凭据

```bash
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET     # 任意高强度随机秘密字符串

# 按需配置模型提供商密钥:
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put TOGETHER_API_KEY
npx wrangler secret put HF_API_KEY

# 若启用 Discord 支持:
npx wrangler secret put DISCORD_PUBLIC_KEY
```

#### 6. 发布上线

```bash
npm run deploy
# 部署完成后将打印访问地址: https://llm-router-bot.<subdomain>.workers.dev
```

#### 7. 绑定平台回调

配置 Telegram Webhook：

```bash
curl -X POST "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
     -d "url=https://llm-router-bot.<subdomain>.workers.dev/tg/<TG_WEBHOOK_SECRET>"
```

配置 Discord 交互：
1. 在 Discord 开发者门户中将 "Interactions Endpoint URL" 设置为：
   ```
   https://llm-router-bot.<subdomain>.workers.dev/interactions
   ```
2. 注册 `/llm` 斜杠指令（仅需执行一次）：
   ```bash
   curl -X POST "https://discord.com/api/v10/applications/<DISCORD_APP_ID>/commands" \
        -H "Authorization: Bot <DISCORD_BOT_TOKEN>" \
        -H "content-type: application/json" \
        -d '{"name":"llm","description":"Talk to the LLM router","options":[{"name":"message","description":"Your message","type":3,"required":true}]}'
   ```

### 机器人指令参考

在 Telegram 对话框（或 Discord 中使用 `/llm message:<文本>`）发送以下指令：

```
/help              显示帮助说明与用法示例
/providers         查看全部提供商列表及当前启用状态
/quota             查看今日各提供商调用量统计 (基于 UTC 时间)
/history           查看最近几轮会话上下文
/reset             重置已存储的会话历史及默认提供商设置
/ai <提供商>       模式 A: 设置全局默认模型 (如: /ai groq)
/all <内容>        模式 C: 向所有已启用模型发起并发查询对比
? <内容>           模式 C 的快捷触发形式
!<前缀> <内容>     模式 B: 单次覆盖指令 (如: !gemini 你好)
<其他任意文本>     直接交互：优先使用默认模型或自动回退链
```

### 配置环境变量一览

| 变量名 | 配置层级 | 说明 |
|---|---|---|
| `TG_OWNER_ID` | `[vars]` | 必需。授权访问的 Telegram 管理员数字 ID |
| `TG_BOT_TOKEN` | secret | 必需。BotFather 颁发的 Telegram 机器人令牌 |
| `TG_WEBHOOK_SECRET` | secret | 必需。用于 Webhook 路径校验的自定义安全密钥 |
| `DISCORD_OWNER_ID` | `[vars]` | 可选。授权访问的 Discord 管理员用户 ID |
| `DISCORD_APP_ID` | `[vars]` | 可选。Discord 开发者应用 ID |
| `DISCORD_PUBLIC_KEY` | secret | 可选。用于交互验签的 Discord Ed25519 公钥 |
| `GROQ_API_KEY` | secret | 可选。启用 `groq` 提供商的密钥 |
| `GEMINI_API_KEY` | secret | 可选。启用 `gemini-flash` 与 `gemini-pro` 的密钥 |
| `OPENROUTER_API_KEY` | secret | 可选。启用 `deepseek-r1` 提供商的密钥 |
| `TOGETHER_API_KEY` | secret | 可选。启用 `together-qwen` 提供商的密钥 |
| `HF_API_KEY` | secret | 可选。启用 `hf` 提供商的密钥 |
| `DISABLED_PROVIDERS` | `[vars]` | 可选。显式禁用的提供商列表（逗号分隔） |
| `HISTORY_TURNS` | `[vars]` | 可选。单用户保留的历史轮数（默认为 10） |

### 常见问题 (FAQ)

**问：为什么选择多模型路由器而不是绑定单一模型？**
答：不同提供商的优势领域和免费配额各异。通过路由器，运营者可以将宝贵的高级推理额度（如 Gemini Pro、DeepSeek R1）留给高难度任务，由充裕的日常额度（Groq、Workers AI）承担常规对话，同时支持随时自由覆盖切换。

**问：对话上下文保存在哪里？**
答：保存在绑定的 `SESSIONS` KV 空间中，键名为 `user:<platform>:<userId>`。窗口大小由 `HISTORY_TURNS` 控制（默认为 10）。执行 `/reset` 可立即清空。

**问：每日限额是如何统计的？**
答：每次分发调用均会在 KV 中记录 `quota:<providerId>:<YYYY-MM-DD>` 计数。条目具备 36 小时生存时间（TTL），以便在次日仍能随时查验昨日统计。

**问：如何接入新的模型提供商？**
答：只需在 `src/providers/` 目录下新增一个实现 `Provider` 接口的 TypeScript 文件，并在 `src/providers/index.ts` 中的 `ALL_PROVIDERS` 与 `PREFIX_ALIASES` 注册即可，路由器核心逻辑无需做任何改动。

### 许可证

基于 MIT 许可证分发。详情请参阅 [LICENSE](../../LICENSE)。

### 免责声明

本项目仅供运营者个人在其拥有合法使用权的提供商账户下作为自用工具使用。遵守各提供商的服务条款及可接受使用政策由使用者自行负责。**严禁将本 Worker 作为公共服务部署或直接暴露给未受信任的第三方用户。**
