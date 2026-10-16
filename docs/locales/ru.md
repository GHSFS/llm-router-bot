<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <a href="./ko.md">🇰🇷 한국어</a> · <a href="./zh-CN.md">🇨🇳 中文</a> · <a href="./es.md">🇪🇸 Español</a> · <a href="./hi.md">🇮🇳 हिन्दी</a><br />
  <a href="./ar.md">🇸🇦 العربية</a> · <a href="./pt-BR.md">🇧🇷 Português</a> · <strong>🇷🇺 Русский</strong> · <a href="./fr.md">🇫🇷 Français</a> · <a href="./id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> Мультипровайдерный LLM-маршрутизатор, обслуживающий ботов для Telegram и Discord из единого Cloudflare Worker.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### Обзор

`llm-router-bot` — это персональный Cloudflare Worker для одного пользователя, который размещает тонкий интеллектуальный слой маршрутизации перед несколькими большими языковыми моделями (LLM) и открывает доступ к ним через Telegram-бота и (опционально) Discord-бота. Он создан для операторов, которые уже имеют API-ключи нескольких провайдеров и хотят использовать надежную цепочку автоматического переключения (fallback) вместо ручного выбора сервиса при каждом запросе.

Маршрутизатор отслеживает лимиты скорости (rate limits): он знает суточный лимит каждого провайдера и ведет подсчет запросов по дате UTC в пространстве имен KV. Как только провайдер исчерпывает свой суточный лимит, он автоматически исключается из цепочки до полуночи по UTC, а следующий по приоритету провайдер перехватывает запросы без вмешательства оператора.

### Возможности

- **Три одновременных режима маршрутизации** — установка провайдера по умолчанию, разовое переопределение префиксом в сообщении или параллельный опрос всех активных провайдеров для сравнения ответов.
- **Активация по наличию API-ключа** — провайдер активируется только при наличии соответствующего ключа в хранилище секретов Worker. Workers AI доступен всегда без ключа.
- **Точный учет суточной квоты** — каждая отправка увеличивает счетчик провайдера в KV; маршрутизатор автоматически пропускает провайдеров с исчерпанным лимитом.
- **Ядро, независимое от платформ** — модули парсера, маршрутизатора и провайдеров изолированы от Telegram и Discord. Адаптеры приводят входящие данные к единому внутреннему объекту `Message`.
- **Контроль владельца (Owner Gate) на обоих сервисах** — сообщения в Telegram от сторонних `from.id` молча отбрасываются; запросы в Discord отклоняются временной ошибкой. URL вебхука содержит секретный путь для усиленной защиты.
- **Сохранение контекста диалога** — недавние реплики (по умолчанию 10) сохраняются в KV, обеспечивая естественный диалог. Контекст можно сбросить командой `/reset`.

### Три режима работы

Все три режима доступны одновременно и выбираются для каждого сообщения:

```
Режим A — Установка провайдера по умолчанию:
    /ai groq          Все последующие обычные сообщения направляются в Groq.

Режим B — Разовое переопределение префиксом:
    !gemini привет    На это сообщение ответит Gemini (настройка по умолчанию не изменится).

Режим C — Параллельное сравнение провайдеров:
    ? что такое X     или  /all что такое X
    Параллельный опрос всех активных провайдеров с выводом маркированных ответов.
```

### Архитектура

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

### Структура проекта

```
llm-router-bot/
├── package.json              npm-скрипты: build (tsc), test (vitest), deploy, format
├── tsconfig.json             Строгий TypeScript с allowImportingTsExtensions
├── wrangler.example.toml     Шаблон конфигурации Cloudflare Worker
├── README.md                 Основная документация на английском языке
├── LICENSE                   Лицензия MIT
├── CHANGELOG.md              Журнал изменений
├── docs/locales/             Локализованная документация (ko, zh-CN, es, hi, ar, pt-BR, ru, fr, id)
├── src/
│   ├── index.ts              Главный обработчик fetch (маршруты /, /tg/<secret>, /interactions)
│   ├── types.ts              Определения типов: Env, Message, Provider, ParsedCommand
│   ├── parser.ts             Чистая функция разбора (слэш-команды, префикс !, шорткат ?)
│   ├── router.ts             Диспетчеризация режимов A/B/C, цепочка fallback и сохранение истории
│   ├── format.ts             Экранирование MarkdownV2 для Telegram, Discord и нарезка по 4096 символов
│   ├── kv.ts                 KV-утилиты для состояния пользователя и истории
│   ├── quota.ts              Суточные счетчики по провайдерам, валидация isUnderQuota и снапшоты
│   ├── platforms/
│   │   ├── telegram.ts       Адаптер вебхука, шлюз владельца и отправка сообщений частями
│   │   └── discord.ts        Адаптер взаимодействий, проверка Ed25519, отложенный ответ и /llm
│   └── providers/
│       ├── index.ts          Реестр провайдеров, порядок приоритета и алиасы
│       ├── workers-ai.ts     Биндинг env.AI от Cloudflare (Llama 3.3 70B и 8B)
│       ├── groq.ts           Groq Chat Completions (Llama 3.3 70B)
│       ├── gemini.ts         Google AI Studio (Gemini 2.5 Flash и Pro)
│       ├── openrouter.ts     OpenRouter (дистиллят DeepSeek R1 для рассуждений)
│       ├── together.ts       Together AI (Qwen 2.5 72B мультиязычный)
│       └── hf.ts             HuggingFace router (Llama 3.3 70B дополнительный fallback)
├── test/
│   ├── parser.test.ts        18 модульных тестов парсера
│   ├── router.test.ts        9 тестов маршрутизации и ограничений
│   └── format.test.ts        10 тестов форматирования сообщений
└── .github/workflows/
    ├── build.yml             tsc + wrangler deploy --dry-run
    └── test.yml              prettier --check + tsc + vitest
```

### Каталог провайдеров

Порядок приоритета по умолчанию. Провайдер включается динамически при наличии его API-ключа в секретах Worker. `Workers AI` всегда доступен без ключей.

| # | ID | Модель | Суточный лимит | Примечание |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14,400 | Высокоскоростная основная модель |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10,000 | Ключ не требуется (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | Качественный fallback |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | Сильна в рассуждениях |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10,000 | Легковесный запасной вариант |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | Отличная мультиязычность |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1,000 | Дополнительный резерв |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | Для сложных аналитических задач |

### Быстрый старт и развертывание

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build

cp wrangler.example.toml wrangler.toml
# Заполните wrangler.toml: укажите идентификаторы KV и ваш TG_OWNER_ID

npx wrangler kv namespace create SESSIONS
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET

npm run deploy
```

### Команды бота

```
/help              Справка по использованию
/providers         Список провайдеров и их статус
/quota             Расход суточной квоты (UTC)
/history           Последние сообщения сессии
/reset             Сброс истории и провайдера по умолчанию
/ai <провайдер>    Режим A: выбор провайдера по умолчанию
/all <текст>       Режим C: параллельный запрос всем активным моделям
? <текст>          Сокращение для Режима C
!<префикс> <текст> Режим B: разовое переопределение для одного сообщения
```

### Лицензия и отказ от ответственности

- **Лицензия**: MIT. Подробнее см. [LICENSE](../../LICENSE).
- **Отказ от ответственности**: Инструмент предназначен исключительно для личного использования оператором с его собственными учетными записями. Запрещено развертывать сервис для публичного доступа третьих лиц.
