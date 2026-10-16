<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <a href="./ko.md">🇰🇷 한국어</a> · <a href="./zh-CN.md">🇨🇳 中文</a> · <a href="./es.md">🇪🇸 Español</a> · <a href="./hi.md">🇮🇳 हिन्दी</a><br />
  <strong>🇸🇦 العربية</strong> · <a href="./pt-BR.md">🇧🇷 Português</a> · <a href="./ru.md">🇷🇺 Русский</a> · <a href="./fr.md">🇫🇷 Français</a> · <a href="./id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> موجه نماذج الذكاء الاصطناعي (LLM) متعدد المزودين يدير روبوتات تيليجرام وديسكورد من خلال عامل Cloudflare Worker واحد.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### نظرة عامة (Overview)

`llm-router-bot` هو تطبيق خفيف مبني على Cloudflare Worker ومخصص لمستخدم فردي، يضع طبقة توجيه ذكية أمام العديد من نماذج اللغات الكبيرة (LLMs) ويتيح استخدامها بسهولة عبر بوت تيليجرام وبوت ديسكورد (اختياريًا). تم تصميمه للمشغلين الذين يمتلكون بالفعل مفاتيح API لعدة مزودين ويريدون سلسلة احتياطية متماسكة وتلقائية بدلاً من اختيار المزود يدويًا في كل مرة.

يدرك الموجه حدود معدل الطلبات (Rate Limits): فهو يعلم الحد الأقصى اليومي لكل مزود ويحسب عدد الطلبات عبر مساحة تخزين KV بناءً على تاريخ UTC. وعندما يصل أي مزود إلى حده الأقصى، يتم استبعاده تلقائيًا من السلسلة حتى منتصف ليل UTC، ليتولى المزود التالي في قائمة الأولويات المهمة بسلاسة ودون أي تدخل بشري.

### المميزات الأساسية (Features)

- **ثلاثة أوضاع توجيه متزامنة** — تعيين مزود افتراضي، أو تجاوز مؤقت لكل رسالة باستخدام بادئة (Prefix)، أو مقارنة متوازية لجميع المزودين النشطين.
- **تفعيل مشروط بالمفاتيح** — لا يتم تفعيل المزود إلا في حال توفر مفتاح API الخاص به في مخزن أسرار Worker. بينما تظل خدمة Workers AI مفعلة دائمًا دون الحاجة لأي مفتاح.
- **تتبع الحصة اليومية بدقة** — تزيد كل عملية إرسال عداد المزود في مساحة KV، ويتجاوز الموجه تلقائيًا أي مزود تخطى سقفه اليومي.
- **نواة مستقلة تمامًا عن المنصات** — وحدات التحليل والتوجيه والمزودين معزولة تمامًا عن تيليجرام أو ديسكورد؛ حيث تحول المحولات الطلبات الواردة إلى هيكل `Message` داخلي موحد.
- **حماية المالك على كلا المنصتين** — يتم تجاهل أي رسائل تيليجرام لا تطابق `from.id` المحدد بصمت، وترفض تفاعلات ديسكورد غير المصرح بها فورًا. كما يتضمن مسار Webhook رمزًا سريًا لتعزيز الأمان.
- **سجل محادثة لكل مستخدم** — يتم حفظ آخر الجولات (10 افتراضيًا) في مساحة KV لضمان استمرارية الحديث الطبيعي. ويمكن مسح السجل في أي وقت عبر الأمر `/reset`.

### الأوضاع الثلاثة (Three Modes)

```
الوضع أ — تعيين مزود افتراضي:
    /ai groq          يتم توجيه الرسائل العادية اللاحقة عبر Groq.

الوضع ب — تجاوز مؤقت لرسالة واحدة:
    !gemini مرحبا     يرد Gemini على هذه الرسالة فقط دون تغيير المزود الافتراضي.

الوضع ج — مقارنة كافة المزودين النشطين:
    ? ما هو X         أو  /all ما هو X
    يتم استدعاء جميع المزودين المتاحين بالتوازي وإرجاع إجابات مفصولة بتسميات واضحة.
```

### هيكل المستودع (Repository Layout)

```
llm-router-bot/
├── package.json              أوامر npm: build, test, deploy, format
├── tsconfig.json             إعدادات TypeScript الصارمة
├── wrangler.example.toml     قالب إعدادات Worker
├── README.md                 الملف التوثيقي الرئيسي باللغة الإنجليزية
├── LICENSE                   رخصة MIT
├── CHANGELOG.md              سجل التحديثات
├── docs/locales/             دليل الترجمات الدولية
├── src/
│   ├── index.ts              معالج الطلبات الرئيسي (/, /tg/<secret>, /interactions)
│   ├── types.ts              تعريفات الأنواع المشتركة
│   ├── parser.ts             محلل الأوامر والبادئات
│   ├── router.ts             موزع الأوضاع وسلسلة الدعم والاحتياط
│   ├── format.ts             تنسيق رسائل MarkdownV2 وتجزئتها
│   ├── kv.ts                 مساعد إدارة بيانات الجلسات في KV
│   ├── quota.ts              تتبع الحصص اليومية للمزودين
│   ├── platforms/
│   │   ├── telegram.ts       معالج الويب هوك لتيليجرام
│   │   └── discord.ts        التحقق من توقيع Ed25519 وأوامر ديسكورد
│   └── providers/
│       ├── index.ts          سجل المزودين والأسماء المستعارة
│       ├── workers-ai.ts     ربط Cloudflare Workers AI
│       ├── groq.ts           مزود Groq (Llama 3.3 70B)
│       ├── gemini.ts         Google AI Studio (Gemini 2.5 Flash & Pro)
│       ├── openrouter.ts     OpenRouter (DeepSeek R1 distill)
│       ├── together.ts       Together AI (Qwen 2.5 72B)
│       └── hf.ts             HuggingFace router
├── test/
│   ├── parser.test.ts        18 اختبار وحدة للمحلل
│   ├── router.test.ts        9 اختبارات للتوجيه وإدارة المفاتيح
│   └── format.test.ts        10 اختبارات لتنسيق الرسائل
└── .github/workflows/
    ├── build.yml             فحص البناء
    └── test.yml              تشغيل الاختبارات والتنسيق
```

### قائمة المزودين (Provider Catalogue)

| # | المعرف | النموذج | الحد اليومي | ملاحظات |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14,400 | نموذج أساسي فائق السرعة |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10,000 | متاح دائماً بدون مفتاح (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | بديل عالي الجودة |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | ممتاز في الاستنتاج المنطقي |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10,000 | بديل خفيف وسريع |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | أداء متميز متعدد اللغات |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1,000 | بديل احتياطي مساعد |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | مخصص للمهام الحسابية المعقدة |

### البدء السريع والتثبيت (Quick Start)

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build

cp wrangler.example.toml wrangler.toml
# قم بتحرير wrangler.toml وإدخال معرّفات KV ومعرف المالك TG_OWNER_ID

npx wrangler kv namespace create SESSIONS
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET

npm run deploy
```

### أوامر البوت (Bot Reference)

```
/help              عرض دليل الاستخدام
/providers         عرض قائمة المزودين وحالتهم
/quota             عرض استهلاك الحصة اليومية (UTC)
/history           عرض الرسائل الأخيرة في الجلسة
/reset             مسح السجل وإعادة تعيين المزود الافتراضي
/ai <المزود>       الوضع أ: تعيين المزود الافتراضي
/all <النص>        الوضع ج: توجيه السؤال لجميع المزودين بالتوازي
? <النص>           اختصار للوضع ج
!<البادئة> <النص>  الوضع ب: تجاوز مؤقت لمرة واحدة
```

### الترخيص وإخلاء المسؤولية (License & Disclaimer)

- **الترخيص**: ترخيص MIT. راجع [LICENSE](../../LICENSE) للتفاصيل.
- **إخلاء المسؤولية**: هذه الأداة مخصصة للاستخدام الشخصي للمشغل مع حسابات المزودين التي يملكها قانونيًا. لا تقم بنشر هذا التطبيق كخدمة عامة مفتوحة للجميع.
