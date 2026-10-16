<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <a href="./ko.md">🇰🇷 한국어</a> · <a href="./zh-CN.md">🇨🇳 中文</a> · <strong>🇪🇸 Español</strong> · <a href="./hi.md">🇮🇳 हिन्दी</a><br />
  <a href="./ar.md">🇸🇦 العربية</a> · <a href="./pt-BR.md">🇧🇷 Português</a> · <a href="./ru.md">🇷🇺 Русский</a> · <a href="./fr.md">🇫🇷 Français</a> · <a href="./id.md">🇮🇩 Bahasa Indonesia</a>
</p>

# llm-router-bot

> Enrutador LLM multiproveedor que gestiona bots de Telegram y Discord desde un único Cloudflare Worker.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### Descripción general

`llm-router-bot` es un Cloudflare Worker para un solo usuario que coloca una fina capa de enrutamiento delante de múltiples modelos de lenguaje grandes (LLM) y expone los resultados como un bot de Telegram y (opcionalmente) un bot de Discord. Ha sido diseñado para operadores personales que ya disponen de claves API de varios proveedores y prefieren una cadena coherente de respaldo automático en lugar de seleccionar manualmente cada servicio.

El enrutador reconoce activamente los límites de velocidad (rate limits): conoce el techo diario de cada proveedor y lleva un recuento de peticiones por proveedor y por fecha UTC en un espacio de nombres KV. Cuando un proveedor alcanza su límite, queda temporalmente excluido de la cadena hasta la medianoche UTC, permitiendo que el siguiente proveedor en orden de prioridad tome el relevo de forma automática y transparente.

### Características

- **Tres modos de enrutamiento simultáneos** — Configurar un proveedor predeterminado, anular mediante prefijo en un único mensaje, o consultar todos los proveedores habilitados en paralelo para comparar respuestas.
- **Acceso controlado por clave API** — Los proveedores solo se habilitan cuando su clave correspondiente está presente en el almacén de secretos del Worker. Workers AI está siempre activo sin necesidad de clave.
- **Seguimiento riguroso de cuota diaria** — Cada envío incrementa un contador por proveedor en KV; las rutas omiten automáticamente los proveedores que hayan superado su techo.
- **Núcleo desacoplado de la plataforma** — El analizador sintáctico (parser), el enrutador y los módulos de proveedores desconocen la existencia de Telegram o Discord. Los adaptadores convierten las cargas entrantes en la misma estructura interna `Message`.
- **Compuerta de propietario (Owner) en ambas plataformas** — En Telegram se descartan en silencio los mensajes con `from.id` no autorizado; en Discord se rechazan con un mensaje efímero de error. La URL del Webhook incluye un secreto de ruta como defensa en profundidad.
- **Historial de conversación por usuario** — Los turnos recientes (10 por defecto) se almacenan en KV, permitiendo mantener una conversación fluida. Se puede reiniciar en cualquier momento con `/reset`.

### Tres modos de uso

Los tres modos están disponibles simultáneamente y pueden elegirse mensaje por mensaje:

```
Modo A — Definir proveedor predeterminado:
    /ai groq          Los mensajes posteriores sin prefijo se enrutarán a través de Groq.

Modo B — Anulación única con prefijo:
    !gemini hola      Solo este mensaje será respondido por Gemini (el valor predeterminado no cambia).

Modo C — Comparar todos los proveedores activos:
    ? qué es X        o  /all qué es X
    Invoca en paralelo a todos los proveedores habilitados y devuelve respuestas etiquetadas.
```

El texto simple sin comandos ni prefijos se enruta hacia el proveedor predeterminado del usuario. Si no se ha configurado ninguno, se ejecuta la cadena de reserva automática.

### Arquitectura

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

### Estructura del proyecto

```
llm-router-bot/
├── package.json              Scripts npm: build (tsc), test (vitest), deploy, format
├── tsconfig.json             TypeScript estricto con allowImportingTsExtensions
├── wrangler.example.toml     Plantilla de configuración de Cloudflare Worker
├── README.md                 Documento principal en inglés
├── LICENSE                   Licencia MIT
├── CHANGELOG.md              Registro de cambios
├── docs/locales/             Documentación traducida (ko, zh-CN, es, hi, ar, pt-BR, ru, fr, id)
├── src/
│   ├── index.ts              Manejador fetch principal (rutas /, /tg/<secret>, /interactions)
│   ├── types.ts              Definición de tipos globales: Env, Message, Provider, ParsedCommand
│   ├── parser.ts             Analizador puro de texto (comandos slash, prefijos !, atajo ?)
│   ├── router.ts             Despacho de modos A/B/C, cadena de respaldo y persistencia de turnos
│   ├── format.ts             Escapado MarkdownV2 de Telegram, Discord y fragmentación a 4096 caracteres
│   ├── kv.ts                 Gestor KV del estado de usuario (historial y proveedor predeterminado)
│   ├── quota.ts              Contadores diarios de uso por proveedor, isUnderQuota y snapshots
│   ├── platforms/
│   │   ├── telegram.ts       Adaptador Webhook, compuerta de propietario y envío por fragmentos
│   │   └── discord.ts        Adaptador de interacciones, firma Ed25519, respuesta diferida y /llm
│   └── providers/
│       ├── index.ts          Registro y prioridad de proveedores, alias de prefijos
│       ├── workers-ai.ts     Binding env.AI de Cloudflare (Llama 3.3 70B y 8B)
│       ├── groq.ts           Groq Chat Completions (Llama 3.3 70B)
│       ├── gemini.ts         Google AI Studio (Gemini 2.5 Flash y Pro)
│       ├── openrouter.ts     OpenRouter (DeepSeek R1 distill para razonamiento)
│       ├── together.ts       Together AI (Qwen 2.5 72B multitarea y multilingüe)
│       └── hf.ts             HuggingFace router (Llama 3.3 70B como respaldo auxiliar)
├── test/
│   ├── parser.test.ts        18 pruebas unitarias para comandos, prefijos y casos límite
│   ├── router.test.ts        9 pruebas unitarias de control de flujo y denegación de claves
│   └── format.test.ts        10 pruebas unitarias de escapado MarkdownV2 y corte de mensajes
└── .github/workflows/
    ├── build.yml             tsc + wrangler deploy --dry-run
    └── test.yml              prettier --check + tsc + vitest
```

### Catálogo de proveedores

Orden de prioridad predeterminado. Cada proveedor se activa dinámicamente si su clave API está configurada en los secretos del Worker. `Workers AI` es el único proveedor permanentemente disponible sin clave.

| # | ID | Modelo | Límite diario | Notas |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14.400 | Principal de alta velocidad |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10.000 | Sin clave requerida (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | Respaldo de alta calidad |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | Especializado en razonamiento |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10.000 | Respaldo ultraligero |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | Excelente en múltiples idiomas |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1.000 | Respaldo auxiliar |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | Reservado para tareas complejas |

Alias utilizables con `!` y `/ai`: `groq`, `gemini`, `gemini-pro`, `deepseek` / `r1`, `qwen` / `together`, `hf`, `workers-ai` / `cf`, `workers-70b`, `workers-8b`, `pro`.

### Compatibilidad

| Componente | Soporte |
|---|---|
| Runtime de Worker | Cloudflare Workers (`compatibility_date = 2026-01-01`) |
| Entorno Node | Node 22+ para desarrollo local e integración continua (requerido por wrangler 4.x) |
| TypeScript | 5.7+ (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) |
| Telegram | Bot API Webhook, modo de análisis `MarkdownV2` |
| Discord | Interactions API v10, verificación de firma Ed25519 |
| Espacio de nombres KV | Un único espacio enlazado como `SESSIONS` |
| Enlace AI | `[ai] binding = "AI"` |

El Worker en sí es agnóstico a la plataforma: funciona en el entorno estándar de Cloudflare Workers sin dependencias específicas de Node.js. Todas las peticiones HTTP se gestionan mediante el `fetch` global y todas las operaciones criptográficas mediante `crypto.subtle`.

### Consideraciones de seguridad

- **Filtro de usuario único** — Cada mensaje recibido se valida contra `TG_OWNER_ID` (Telegram) o `DISCORD_OWNER_ID` (Discord). Las peticiones no autorizadas se descartan silenciosamente en Telegram y se rechazan con un mensaje efímero en Discord.
- **Ruta secreta para Telegram** — La URL del Webhook es `/tg/<TG_WEBHOOK_SECRET>`. Si el secreto no coincide exactamente, se devuelve un código 403 antes de leer el cuerpo del mensaje, protegiendo contra escaneos maliciosos.
- **Verificación criptográfica Ed25519 en Discord** — Toda interacción recibida de Discord se valida criptográficamente contra la clave pública de la aplicación mediante `crypto.subtle.verify`. Si la firma no es válida, se rechaza inmediatamente con código 401.
- **Almacenamiento seguro de claves** — Las claves API se introducen exclusivamente mediante `wrangler secret put <NOMBRE>` en el almacén cifrado de Cloudflare y nunca se suben al control de versiones.
- **Cero telemetría externa** — El Worker únicamente realiza peticiones hacia las APIs de los proveedores, Telegram y Discord.
- **Aislamiento total del historial** — El contexto de conversación se almacena bajo la clave `user:<platform>:<userId>` y no se comparte con ningún otro usuario.

### Resolución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El bot de Telegram no responde | URL de webhook errónea o discrepancia con `TG_OWNER_ID` | Consulte `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` y verifique que su ID coincida con `TG_OWNER_ID` |
| El Webhook devuelve 403 | El secreto en la ruta no coincide con `TG_WEBHOOK_SECRET` | Vuelva a ejecutar `setWebhook` asegurándose de usar el mismo secreto configurado en el Worker |
| Discord indica "interaction failed" | Clave pública Ed25519 incorrecta o demora superior a 3 segundos | Verifique `DISCORD_PUBLIC_KEY` y compruebe los registros del Worker para verificar la respuesta diferida |
| Respuesta `All providers failed` | Todos los proveedores configurados fallaron o agotaron su cuota | Envíe `/quota` para examinar el uso de hoy; espere la medianoche UTC o agregue claves de nuevos proveedores |
| `/ai groq` indica "not currently enabled" | Falta la clave secreta `GROQ_API_KEY` | Registre el secreto con `npx wrangler secret put GROQ_API_KEY` y vuelva a desplegar |
| La comparación paralela devuelve pocas secciones | La mayoría de proveedores no tienen claves API asociadas | Use `/providers` para revisar cuáles están activos y proporcione las claves necesarias |

### Instalación y despliegue

#### 1. Requisitos previos

- Cuenta de Cloudflare.
- Node.js 22+ y npm en el entorno local.
- Un bot de Telegram creado en [@BotFather](https://t.me/BotFather) (token y su ID de usuario numérico).
- (Opcional) Una aplicación de Discord con su ID y clave pública Ed25519.
- (Opcional) Claves API de Groq, Google AI Studio (Gemini), OpenRouter, Together AI o HuggingFace (el Worker puede operar exclusivamente con Workers AI sin ninguna de ellas).

#### 2. Clonar e instalar

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build
```

#### 3. Crear el espacio de nombres KV

```bash
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
```

Copie los identificadores `id` y `preview_id` generados por Wrangler.

#### 4. Configuración inicial

```bash
cp wrangler.example.toml wrangler.toml
# Edite wrangler.toml para indicar los identificadores KV, TG_OWNER_ID y parámetros de Discord
```

#### 5. Configurar los secretos

```bash
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET     # Cadena secreta y aleatoria

# Registre las claves de los proveedores que desee habilitar:
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put TOGETHER_API_KEY
npx wrangler secret put HF_API_KEY

# Si utiliza Discord:
npx wrangler secret put DISCORD_PUBLIC_KEY
```

#### 6. Desplegar

```bash
npm run deploy
# Se mostrará la URL pública: https://llm-router-bot.<subdominio>.workers.dev
```

#### 7. Configuración de webhooks

En Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<TG_BOT_TOKEN>/setWebhook" \
     -d "url=https://llm-router-bot.<subdominio>.workers.dev/tg/<TG_WEBHOOK_SECRET>"
```

En Discord:
1. En el portal de desarrolladores de Discord, asigne como "Interactions Endpoint URL":
   ```
   https://llm-router-bot.<subdominio>.workers.dev/interactions
   ```
2. Registre el comando slash `/llm` (una única vez):
   ```bash
   curl -X POST "https://discord.com/api/v10/applications/<DISCORD_APP_ID>/commands" \
        -H "Authorization: Bot <DISCORD_BOT_TOKEN>" \
        -H "content-type: application/json" \
        -d '{"name":"llm","description":"Talk to the LLM router","options":[{"name":"message","description":"Your message","type":3,"required":true}]}'
   ```

### Referencia de comandos

Comandos disponibles en el chat de Telegram (o mediante `/llm message:<texto>` en Discord):

```
/help              Muestra la ayuda y ejemplos de uso
/providers         Lista los proveedores y su estado actual
/quota             Uso acumulado de hoy por proveedor (UTC)
/history           Muestra los últimos turnos de la conversación
/reset             Borra el historial y restablece el proveedor predeterminado
/ai <proveedor>    Modo A: Define el proveedor por defecto (ej: /ai groq)
/all <texto>       Modo C: Consulta a todos los proveedores habilitados en paralelo
? <texto>          Abreviatura del Modo C
!<prefijo> <texto> Modo B: Anulación en un solo mensaje (ej: !gemini hola)
<cualquier texto>  Mensaje estándar enviado al proveedor predeterminado o cadena de reserva
```

### Variables de configuración

| Clave | Ubicación | Descripción |
|---|---|---|
| `TG_OWNER_ID` | `[vars]` | Obligatorio. ID numérico de Telegram autorizado |
| `TG_BOT_TOKEN` | secret | Obligatorio. Token del bot emitido por BotFather |
| `TG_WEBHOOK_SECRET` | secret | Obligatorio. Cadena de seguridad en la ruta del Webhook |
| `DISCORD_OWNER_ID` | `[vars]` | Opcional. ID de usuario autorizado de Discord |
| `DISCORD_APP_ID` | `[vars]` | Opcional. ID de la aplicación en Discord |
| `DISCORD_PUBLIC_KEY` | secret | Opcional. Clave pública Ed25519 de Discord |
| `GROQ_API_KEY` | secret | Opcional. Clave para el proveedor `groq` |
| `GEMINI_API_KEY` | secret | Opcional. Clave para `gemini-flash` y `gemini-pro` |
| `OPENROUTER_API_KEY` | secret | Opcional. Clave para `deepseek-r1` |
| `TOGETHER_API_KEY` | secret | Opcional. Clave para `together-qwen` |
| `HF_API_KEY` | secret | Opcional. Clave para `hf` |
| `DISABLED_PROVIDERS` | `[vars]` | Opcional. Proveedores excluidos explícitamente (separados por coma) |
| `HISTORY_TURNS` | `[vars]` | Opcional. Número de turnos guardados en memoria (por defecto 10) |

### Preguntas frecuentes (FAQ)

**P. ¿Por qué utilizar un enrutador en lugar de un único proveedor?**
R. Cada modelo cuenta con fortalezas distintas y diferentes cuotas gratuitas. Un enrutador permite reservar los límites prémium (Gemini Pro, DeepSeek R1) para tareas complejas y canalizar el uso cotidiano a través de opciones abundantes (Groq, Workers AI).

**P. ¿Dónde se guarda el historial de conversación?**
R. En el espacio KV `SESSIONS` bajo la clave `user:<platform>:<userId>`. La ventana conserva los últimos `HISTORY_TURNS` turnos (10 por defecto). Se elimina instantáneamente con `/reset`.

**P. ¿Cómo se cuantifica el consumo diario?**
R. Cada petición incrementa la clave `quota:<providerId>:<YYYY-MM-DD>` en KV con un tiempo de vida (TTL) de 36 horas, permitiendo inspeccionar el registro de ayer tras el cambio de fecha.

**P. ¿Es posible añadir nuevos proveedores?**
R. Sí. Solo debe implementar la interfaz `Provider` en un archivo dentro de `src/providers/` y declararlo en `ALL_PROVIDERS` y `PREFIX_ALIASES` en `src/providers/index.ts`. No se requiere modificar el enrutador.

### Licencia

MIT. Consulte [LICENSE](../../LICENSE) para más información.

### Descargo de responsabilidad

Esta es una herramienta para uso personal del operador sobre cuentas que le pertenecen legítimamente. Es responsabilidad exclusiva del operador cumplir los términos de servicio y políticas de uso aceptable de cada proveedor. **No despliegue este Worker como un servicio público compartido ni lo exponga a terceros.**
