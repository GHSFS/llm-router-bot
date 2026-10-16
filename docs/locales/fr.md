<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <a href="./ko.md">🇰🇷 한국어</a> · <a href="./zh-CN.md">🇨🇳 中文</a> · <a href="./es.md">🇪🇸 Español</a> · <a href="./hi.md">🇮🇳 हिन्दी</a><br />
  <a href="./ar.md">🇸🇦 العربية</a> · <a href="./pt-BR.md">🇧🇷 Português</a> · <a href="./ru.md">🇷🇺 Русский</a> · <strong>🇫🇷 Français</strong> · <a href="./id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> Routeur LLM multi-fournisseurs desservant des bots Telegram et Discord à partir d'un unique Cloudflare Worker.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### Aperçu

`llm-router-bot` est un Cloudflare Worker à utilisateur unique qui place une fine couche de routage devant plusieurs grands modèles de langage (LLM) et expose le résultat sous forme de bot Telegram et (facultativement) de bot Discord. Il est conçu pour les opérateurs personnels disposant déjà de clés API auprès de plusieurs fournisseurs et souhaitant une chaîne de repli (fallback) automatique et cohérente au lieu de sélectionner manuellement un service à chaque requête.

Le routeur prend en compte les limites de débit (rate limits) : il connaît le plafond quotidien de chaque fournisseur et comptabilise les requêtes par fournisseur et par date UTC dans un espace de noms KV. Lorsqu'un fournisseur atteint son plafond, il est temporairement exclu de la chaîne jusqu'à minuit UTC, permettant au fournisseur suivant dans la liste de priorités de prendre le relais automatiquement et sans intervention humaine.

### Caractéristiques principales

- **Trois modes de routage simultanés** — Définir un fournisseur par défaut, remplacer ponctuellement via un préfixe sur un message unique, ou comparer tous les fournisseurs activés en parallèle.
- **Filtrage par clé API** — Les fournisseurs ne sont activés que si leur clé d'API respective est présente dans le coffre de secrets du Worker. Workers AI reste toujours disponible sans clé.
- **Suivi rigoureux du quota journalier** — Chaque requête incrémente un compteur dédié par fournisseur dans KV ; le routeur ignore automatiquement les fournisseurs ayant dépassé leur plafond.
- **Cœur découplé de la plateforme** — Le parseur, le routeur et les modules de fournisseurs ignorent l'existence de Telegram ou de Discord. Les adaptateurs convertissent les charges entrantes en un format interne unique `Message`.
- **Contrôle d'accès propriétaire (Owner Gate)** — Sur Telegram, les messages provenant d'un `from.id` non autorisé sont ignorés en silence ; sur Discord, ils sont rejetés avec une erreur éphémère. L'URL du webhook inclut un secret de chemin en défense approfondie.
- **Historique de conversation par utilisateur** — Les tours récents (10 par défaut) sont conservés dans KV pour maintenir une conversation fluide. L'historique peut être effacé à tout moment via `/reset`.

### Trois modes d'utilisation

Ces trois modes sont utilisables simultanément et peuvent être choisis message par message :

```
Mode A — Définir un fournisseur par défaut :
    /ai groq          Les messages simples suivants sont acheminés via Groq.

Mode B — Remplacement ponctuel avec un préfixe :
    !gemini bonjour   Seul ce message reçoit une réponse de Gemini (le défaut n'est pas modifié).

Mode C — Comparaison de tous les fournisseurs actifs :
    ? qu'est-ce que X   ou  /all qu'est-ce que X
    Appelle tous les fournisseurs activés en parallèle et renvoie des réponses clairement étiquetées.
```

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

### Structure du dépôt

```
llm-router-bot/
├── package.json              Scripts npm : build (tsc), test (vitest), deploy, format
├── tsconfig.json             TypeScript strict avec allowImportingTsExtensions
├── wrangler.example.toml     Modèle de configuration Cloudflare Worker
├── README.md                 Documentation principale en anglais
├── LICENSE                   Licence MIT
├── CHANGELOG.md              Historique des modifications
├── docs/locales/             Documentations traduites (ko, zh-CN, es, hi, ar, pt-BR, ru, fr, id)
├── src/
│   ├── index.ts              Gestionnaire fetch principal (routes /, /tg/<secret>, /interactions)
│   ├── types.ts              Définitions des types : Env, Message, Provider, ParsedCommand
│   ├── parser.ts             Fonction pure de parsing (commandes slash, préfixes !, raccourci ?)
│   ├── router.ts             Aiguillage des modes A/B/C, chaîne de repli et sauvegarde de l'historique
│   ├── format.ts             Échappement MarkdownV2 Telegram, Discord et découpage en blocs de 4096 caractères
│   ├── kv.ts                 Utilitaires KV pour l'état utilisateur et l'historique
│   ├── quota.ts              Compteurs journaliers par fournisseur, validation isUnderQuota et aperçus
│   ├── platforms/
│   │   ├── telegram.ts       Adaptateur Webhook, filtre propriétaire et envoi par blocs
│   │   └── discord.ts        Adaptateur d'interactions, signature Ed25519, réponse différée et /llm
│   └── providers/
│       ├── index.ts          Registre des fournisseurs, ordre de priorité et alias
│       ├── workers-ai.ts     Bindings env.AI de Cloudflare (Llama 3.3 70B et 8B)
│       ├── groq.ts           Groq Chat Completions (Llama 3.3 70B)
│       ├── gemini.ts         Google AI Studio (Gemini 2.5 Flash et Pro)
│       ├── openrouter.ts     OpenRouter (distillation DeepSeek R1 pour le raisonnement)
│       ├── together.ts       Together AI (Qwen 2.5 72B multilingue)
│       └── hf.ts             HuggingFace router (Llama 3.3 70B repli secondaire)
├── test/
│   ├── parser.test.ts        18 tests unitaires de parsing
│   ├── router.test.ts        9 tests unitaires de flux et de gestion des clés
│   └── format.test.ts        10 tests unitaires de formatage
└── .github/workflows/
    ├── build.yml             tsc + wrangler deploy --dry-run
    └── test.yml              prettier --check + tsc + vitest
```

### Catalogue des fournisseurs

Ordre de priorité par défaut. Un fournisseur est activé dynamiquement lorsque sa clé API est configurée dans le magasin de secrets du Worker. `Workers AI` est toujours disponible sans clé.

| # | ID | Modèle | Plafond journalier | Remarques |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14 400 | Principal ultra-rapide |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10 000 | Aucune clé requise (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | Repli de haute qualité |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | Spécialiste du raisonnement logique |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10 000 | Repli léger et rapide |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | Spécialiste multilingue |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1 000 | Repli auxiliaire |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | Réservé aux raisonnements complexes |

### Démarrage rapide et déploiement

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build

cp wrangler.example.toml wrangler.toml
# Renseignez les identifiants KV et votre TG_OWNER_ID dans wrangler.toml

npx wrangler kv namespace create SESSIONS
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET

npm run deploy
```

### Commandes du bot

```
/help              Affiche l'aide et les exemples d'utilisation
/providers         Liste les fournisseurs et leur état d'activation
/quota             Consommation du quota journalier (UTC)
/history           Affiche les derniers tours de conversation
/reset             Efface l'historique et réinitialise le fournisseur par défaut
/ai <fournisseur>  Mode A : Définir le fournisseur par défaut
/all <texte>       Mode C : Interroger tous les fournisseurs en parallèle
? <texte>          Raccourci pour le Mode C
!<préfixe> <texte> Mode B : Remplacement ponctuel sur un seul message
```

### Licence et avertissement

- **Licence** : MIT. Voir [LICENSE](../../LICENSE) pour plus de détails.
- **Avertissement** : Cet outil est strictement destiné à un usage personnel par l'opérateur avec ses propres comptes de fournisseurs. Ne déployez pas ce Worker en tant que service public partagé.
