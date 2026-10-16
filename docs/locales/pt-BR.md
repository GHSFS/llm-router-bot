<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <a href="./ko.md">🇰🇷 한국어</a> · <a href="./zh-CN.md">🇨🇳 中文</a> · <a href="./es.md">🇪🇸 Español</a> · <a href="./hi.md">🇮🇳 हिन्दी</a><br />
  <a href="./ar.md">🇸🇦 العربية</a> · <strong>🇧🇷 Português</strong> · <a href="./ru.md">🇷🇺 Русский</a> · <a href="./fr.md">🇫🇷 Français</a> · <a href="./id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> Roteador LLM multiprovedor que gerencia bots do Telegram e Discord a partir de um único Cloudflare Worker.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### Visão geral

`llm-router-bot` é um Cloudflare Worker para usuário único que coloca uma fina camada de roteamento na frente de múltiplos modelos de linguagem grandes (LLMs) e expõe o resultado como um bot do Telegram e (opcionalmente) um bot do Discord. Foi desenvolvido para operadores individuais que já possuem chaves de API de vários provedores e desejam uma cadeia de fallback automática e consistente em vez de selecionar o serviço manualmente a cada interação.

O roteador monitora ativamente limites de requisição (rate limits): conhece o teto diário de cada provedor e registra as requisições por provedor e por data UTC em um namespace KV. Quando um provedor atinge seu teto, é automaticamente removido da cadeia até a meia-noite UTC, permitindo que o próximo provedor na ordem de prioridade assuma o atendimento sem necessidade de intervenção manual.

### Recursos

- **Três modos de roteamento simultâneos** — Definição de provedor padrão, substituição pontual via prefixo em uma mensagem, ou comparação paralela de todos os provedores habilitados.
- **Controle estrito por chave de API** — Os provedores só são ativados quando sua respectiva chave está configurada no cofre de segredos do Worker. O Workers AI está sempre ativo sem necessidade de chave.
- **Rastreamento rigoroso de cota diária** — Cada disparo incrementa um contador específico por provedor no KV; as rotas ignoram automaticamente provedores que ultrapassaram sua cota.
- **Núcleo desacoplado e agnóstico** — O parser, o roteador e os módulos de provedores não conhecem detalhes de Telegram ou Discord. Adaptadores dedicados convertem as cargas úteis de entrada no mesmo formato interno `Message`.
- **Portão de proprietário (Owner) em ambas as plataformas** — No Telegram, requisições com `from.id` divergente são descartadas silenciosamente; no Discord, interações não autorizadas são rejeitadas com erro efêmero. A URL do Webhook inclui uma rota secreta como defesa em profundidade.
- **Histórico de conversa por usuário** — As rodadas recentes (10 por padrão) são preservadas no KV para manter a fluidez natural do chat. O histórico pode ser resetado a qualquer momento com `/reset`.

### Três modos de operação

Todos os três modos estão disponíveis simultaneamente e podem ser escolhidos mensagem por mensagem:

```
Modo A — Definir provedor padrão:
    /ai groq          Mensagens subsequentes sem comando usarão o Groq.

Modo B — Substituição pontual com prefixo:
    !gemini olá       Apenas esta mensagem será respondida pelo Gemini (o padrão permanece inalterado).

Modo C — Comparação de todos os provedores ativos:
    ? o que é X       ou  /all o que é X
    Dispara chamadas paralelas para todos os provedores habilitados e retorna respostas etiquetadas.
```

### Arquitetura

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

### Estrutura do projeto

```
llm-router-bot/
├── package.json              Scripts npm: build (tsc), test (vitest), deploy, format
├── tsconfig.json             TypeScript estrito com allowImportingTsExtensions
├── wrangler.example.toml     Modelo de configuração do Cloudflare Worker
├── README.md                 Documentação principal em inglês
├── LICENSE                   Licença MIT
├── CHANGELOG.md              Histórico de versões
├── docs/locales/             Documentações traduzidas (ko, zh-CN, es, hi, ar, pt-BR, ru, fr, id)
├── src/
│   ├── index.ts              Handler principal de fetch (rotas /, /tg/<secret>, /interactions)
│   ├── types.ts              Definições de tipos: Env, Message, Provider, ParsedCommand
│   ├── parser.ts             Função pura de parsing (comandos slash, prefixo !, atalho ?)
│   ├── router.ts             Despacho de modos A/B/C, cadeia de fallback e persistência de histórico
│   ├── format.ts             Escape MarkdownV2 para Telegram, Discord e divisão em blocos de 4096 caracteres
│   ├── kv.ts                 Helpers KV para estado do usuário e histórico
│   ├── quota.ts              Contadores diários por provedor, validação isUnderQuota e snapshots
│   ├── platforms/
│   │   ├── telegram.ts       Adaptador Webhook, barreira de proprietário e envio fragmentado
│   │   └── discord.ts        Adaptador de interações, verificação Ed25519, resposta diferida e /llm
│   └── providers/
│       ├── index.ts          Registro de provedores, ordem de prioridade e alias de prefixos
│       ├── workers-ai.ts     Bindings env.AI do Cloudflare (Llama 3.3 70B e 8B)
│       ├── groq.ts           Groq Chat Completions (Llama 3.3 70B)
│       ├── gemini.ts         Google AI Studio (Gemini 2.5 Flash e Pro)
│       ├── openrouter.ts     OpenRouter (DeepSeek R1 distill para raciocínio)
│       ├── together.ts       Together AI (Qwen 2.5 72B para múltiplos idiomas)
│       └── hf.ts             HuggingFace router (Llama 3.3 70B como fallback auxiliar)
├── test/
│   ├── parser.test.ts        18 testes unitários para comandos, prefixos e casos limite
│   ├── router.test.ts        9 testes unitários de fluxo de controle e rejeição por falta de chave
│   └── format.test.ts        10 testes unitários de escape MarkdownV2 e limites de corte
└── .github/workflows/
    ├── build.yml             tsc + wrangler deploy --dry-run
    └── test.yml              prettier --check + tsc + vitest
```

### Catálogo de provedores

Ordem padrão de prioridade. Cada provedor é ativado dinamicamente se a sua chave de API correspondente estiver presente no cofre de segredos do Worker. O `Workers AI` é o único provedor que funciona de forma ininterrupta sem chave.

| # | ID | Modelo | Teto diário | Observações |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14.400 | Principal de altíssima velocidade |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10.000 | Sem necessidade de chave (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | Fallback de alta qualidade |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | Especializado em raciocínio |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10.000 | Fallback leve |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | Excelente em vários idiomas |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1.000 | Fallback auxiliar |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | Reservado para raciocínio profundo |

Alias aceitos em `!` e `/ai`: `groq`, `gemini`, `gemini-pro`, `deepseek` / `r1`, `qwen` / `together`, `hf`, `workers-ai` / `cf`, `workers-70b`, `workers-8b`, `pro`.

### Instalação e implantação rápida

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build

cp wrangler.example.toml wrangler.toml
# Edite wrangler.toml com os IDs de KV e seu TG_OWNER_ID

npx wrangler kv namespace create SESSIONS
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET

npm run deploy
```

### Comandos do bot

```
/help              Exibe instruções de uso
/providers         Lista provedores e seus estados atuais
/quota             Uso de hoje por provedor (UTC)
/history           Últimas rodadas da conversa
/reset             Limpa o histórico e redefine o provedor padrão
/ai <provedor>     Modo A: Define o provedor padrão
/all <texto>       Modo C: Consulta todos os provedores em paralelo
? <texto>          Atalho para o Modo C
!<prefixo> <texto> Modo B: Substituição pontual em uma mensagem
```

### Licença e isenção de responsabilidade

- **Licença**: MIT. Consulte [LICENSE](../../LICENSE) para detalhes.
- **Isenção de responsabilidade**: Esta é uma ferramenta para uso pessoal do operador em contas que ele próprio possui. Não implante este Worker como um serviço compartilhado ou aberto a terceiros.
