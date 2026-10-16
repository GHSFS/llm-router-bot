<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <a href="./ko.md">🇰🇷 한국어</a> · <a href="./zh-CN.md">🇨🇳 中文</a> · <a href="./es.md">🇪🇸 Español</a> · <strong>🇮🇳 हिन्दी</strong><br />
  <a href="./ar.md">🇸🇦 العربية</a> · <a href="./pt-BR.md">🇧🇷 Português</a> · <a href="./ru.md">🇷🇺 Русский</a> · <a href="./fr.md">🇫🇷 Français</a> · <a href="./id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> एकल Cloudflare Worker से Telegram और Discord बॉट्स को प्रबंधित करने वाला बहु-प्रदाता LLM राउटर।

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### विवरण (Overview)

`llm-router-bot` एक एकल-उपयोगकर्ता Cloudflare Worker है जो कई बड़े भाषा मॉडलों (LLMs) के सामने एक हल्का रूटिंग स्तर प्रदान करता है और Telegram तथा (वैकल्पिक रूप से) Discord बॉट के माध्यम से परिणाम प्रस्तुत करता है। यह उन व्यक्तिगत ऑपरेटरों के लिए डिज़ाइन किया गया है जिनके पास पहले से कई प्रदाताओं की API कुंजियाँ उपलब्ध हैं और जो हर बार मैन्युअल रूप से सेवा चुनने के बजाय एक स्थिर स्वचालित फ़ॉलबैक शृंखला का उपयोग करना चाहते हैं।

यह राउटर अनुरोध सीमा (rate limit) के प्रति संवेदनशील है: यह प्रत्येक प्रदाता की दैनिक सीमा जानता है और KV नेमस्पेस में UTC तिथि के आधार पर अनुरोधों की गणना करता है। सीमा समाप्त होने पर प्रदाता स्वतः शृंखला से अस्थायी रूप से बाहर हो जाता है और अगला प्राथमिक प्रदाता बिना किसी मानवीय हस्तक्षेप के जिम्मेदारी संभाल लेता है।

### मुख्य विशेषताएँ (Features)

- **एक साथ 3 रूटिंग मोड** — डिफ़ॉल्ट प्रदाता निर्धारित करें, प्रति संदेश प्रीफ़िक्स द्वारा ओवरराइड करें, या सभी सक्रिय प्रदाताओं की समानांतर तुलना करें।
- **API कुंजी गेटिंग** — प्रदाता केवल तभी सक्रिय होते हैं जब उनकी गुप्त कुंजी Worker के सीक्रेट स्टोर में मौजूद हो। Workers AI बिना किसी कुंजी के हमेशा उपलब्ध रहता है।
- **दैनिक कोटा ट्रैकिंग** — प्रत्येक अनुरोध पर KV में प्रदाता-वार काउंटर बढ़ता है; सीमा पार करने वाले प्रदाताओं को राउटर स्वतः छोड़ देता है।
- **प्लेटफ़ॉर्म-स्वतंत्र कोर** — पार्सर, राउटर और प्रदाता मॉड्यूल Telegram या Discord पर निर्भर नहीं हैं। दोनों एडेप्टर इनबाउंड संदेशों को एक ही आंतरिक `Message` संरचना में बदलते हैं।
- **दोनों प्लेटफ़ॉर्म पर स्वामी (Owner) सुरक्षा** — Telegram पर गलत `from.id` वाले संदेश चुपचाप छोड़ दिए जाते हैं; Discord पर अनधिकृत अनुरोधों को त्रुटि के साथ अस्वीकार किया जाता है।
- **प्रति-उपयोगकर्ता वार्तालाप इतिहास** — हाल के 10 संदेश KV में सहेजे जाते हैं ताकि सामान्य बातचीत स्वाभाविक लगे। `/reset` द्वारा इसे कभी भी साफ़ किया जा सकता है।

### तीन उपयोग मोड (Three Modes)

तीनों मोड एक साथ उपलब्ध हैं और प्रत्येक संदेश के लिए चुने जा सकते हैं:

```
मोड A — डिफ़ॉल्ट प्रदाता सेट करें:
    /ai groq          इसके बाद के सामान्य संदेश Groq के माध्यम से जाएंगे।

मोड B — प्रीफ़िक्स के साथ एक बार ओवरराइड करें:
    !gemini hello     केवल इसी संदेश का उत्तर Gemini देगा (डिफ़ॉल्ट सेटिंग्स नहीं बदलती)।

मोड C — सभी सक्रिय प्रदाताओं की तुलना करें:
    ? what is X       या  /all what is X
    सभी सक्रिय प्रदाताओं को समानांतर रूप से कॉल किया जाता है और तुलनात्मक उत्तर प्राप्त होता है।
```

### सिस्टम संरचना (Architecture)

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

### रिपॉजिटरी संरचना (Repository Layout)

```
llm-router-bot/
├── package.json              npm स्क्रिप्ट: build, test, deploy, format
├── tsconfig.json             सख्त TypeScript कॉन्फ़िगरेशन
├── wrangler.example.toml     Worker कॉन्फ़िगरेशन टेम्पलेट
├── README.md                 अंग्रेजी मुख्य दस्तावेज़
├── LICENSE                   MIT लाइसेंस
├── CHANGELOG.md              संस्करण इतिहास
├── docs/locales/             बहुभाषी अनुवाद दस्तावेज़
├── src/
│   ├── index.ts              fetch हैंडलर (/, /tg/<secret>, /interactions)
│   ├── types.ts              प्रकार परिभाषाएँ (Env, Message, Provider, ParsedCommand)
│   ├── parser.ts             कमांड/प्रीफ़िक्स पार्सर
│   ├── router.ts             A/B/C मोड डिस्पैच और इतिहास प्रबंधन
│   ├── format.ts             Telegram MarkdownV2 और Discord संदेश फ़ॉर्मेटिंग
│   ├── kv.ts                 KV सत्र सहायक
│   ├── quota.ts              दैनिक कोटा ट्रैकिंग और स्नैपशॉट
│   ├── platforms/
│   │   ├── telegram.ts       Telegram वेबहुक और संदेश हैंडलर
│   │   └── discord.ts        Discord Ed25519 सत्यापन और /llm कमांड
│   └── providers/
│       ├── index.ts          प्रदाता रजिस्ट्री और उपनाम (aliases)
│       ├── workers-ai.ts     Cloudflare env.AI बाइंडिंग (Llama 3.3 70B & 8B)
│       ├── groq.ts           Groq Llama 3.3 70B
│       ├── gemini.ts         Gemini 2.5 Flash & Pro
│       ├── openrouter.ts     DeepSeek R1 distill (OpenRouter)
│       ├── together.ts       Together AI Qwen 2.5 72B
│       └── hf.ts             HuggingFace router Llama 3.3 70B
├── test/
│   ├── parser.test.ts        18 यूनिट टेस्ट
│   ├── router.test.ts        9 यूनिट टेस्ट
│   └── format.test.ts        10 यूनिट टेस्ट
└── .github/workflows/
    ├── build.yml             tsc + wrangler dry-run
    └── test.yml              prettier + tsc + vitest
```

### प्रदाता सूची (Provider Catalogue)

| # | ID | मॉडल | दैनिक सीमा | टिप्पणी |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14,400 | अत्यधिक तीव्र प्राथमिक मॉडल |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10,000 | बिना API कुंजी के उपलब्ध (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | उच्च गुणवत्ता वाला विकल्प |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | जटिल तर्क (Reasoning) हेतु |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10,000 | हल्का बैकअप मॉडल |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | बहुभाषी विशेषज्ञ |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1,000 | अतिरिक्त बैकअप |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | उन्नत तर्क मॉडल |

`!` और `/ai` के लिए मान्य उपनाम: `groq`, `gemini`, `gemini-pro`, `deepseek` / `r1`, `qwen` / `together`, `hf`, `workers-ai` / `cf`, `workers-70b`, `workers-8b`, `pro`।

### सुरक्षा एवं गोपनीयता (Security)

- **एकल स्वामी प्रमाणीकरण** — केवल अधिकृत `TG_OWNER_ID` और `DISCORD_OWNER_ID` से आए अनुरोधों को संसाधित किया जाता है।
- **गुप्त URL पथ** — Telegram वेबहुक `/tg/<TG_WEBHOOK_SECRET>` पर कार्य करता है। गलत अनुरोधों पर तुरंत 403 मिलता है।
- **Ed25519 सत्यापन** — Discord के प्रत्येक अनुरोध को `crypto.subtle.verify` द्वारा जाँचा जाता है।
- **सुरक्षित क्रेडेंशियल** — सभी API कुंजियाँ `wrangler secret put` के माध्यम से Cloudflare के एन्क्रिप्टेड स्टोर में सुरक्षित रखी जाती हैं।

### त्वरित स्थापना (Quick Start)

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build

cp wrangler.example.toml wrangler.toml
# wrangler.toml में आवश्यक KV ID और TG_OWNER_ID सेट करें

npx wrangler kv namespace create SESSIONS
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET

npm run deploy
```

### बॉट कमांड संदर्भ (Bot Reference)

```
/help              उपयोग मार्गदर्शिका
/providers         प्रदाताओं की सूची और उनकी स्थिति
/quota             आज का कोटा उपयोग (UTC)
/history           हाल के वार्तालाप संदेश
/reset             इतिहास और डिफ़ॉल्ट सेटिंग्स साफ़ करें
/ai <प्रदाता>      मोड A: डिफ़ॉल्ट प्रदाता सेट करें
/all <टेक्स्ट>     मोड C: सभी प्रदाताओं से समानांतर पूछें
? <टेक्स्ट>        मोड C का संक्षिप्त रूप
!<प्रीफ़िक्स> <टेक्स्ट>  मोड B: एक बार ओवरराइड करें
```

### लाइसेंस एवं अस्वीकरण (License & Disclaimer)

- **लाइसेंस**: MIT. विवरण के लिए [LICENSE](../../LICENSE) देखें।
- **अस्वीकरण**: यह एक निजी उपकरण है जो केवल ऑपरेटर के अपने खातों के साथ व्यक्तिगत उपयोग के लिए अभिप्रेत है। इसे सार्वजनिक साझा सेवा के रूप में तैनात न करें।
