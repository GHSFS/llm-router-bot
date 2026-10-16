<div align="center">

<p align="center">
  <a href="../../README.md">🇺🇸 English</a> · <a href="./ko.md">🇰🇷 한국어</a> · <a href="./zh-CN.md">🇨🇳 中文</a> · <a href="./es.md">🇪🇸 Español</a> · <a href="./hi.md">🇮🇳 हिन्दी</a><br />
  <a href="./ar.md">🇸🇦 العربية</a> · <a href="./pt-BR.md">🇧🇷 Português</a> · <a href="./ru.md">🇷🇺 Русский</a> · <a href="./fr.md">🇫🇷 Français</a> · <strong>🇮🇩 Bahasa Indonesia</strong>
</p>

# llm-router-bot

> Router LLM multi-penyedia yang melayani bot Telegram dan Discord dari satu Cloudflare Worker.

[![Build](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/build.yml)
[![Tests](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml/badge.svg)](https://github.com/GHSFS/llm-router-bot/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

</div>

---

### Gambaran Umum (Overview)

`llm-router-bot` adalah Cloudflare Worker pengguna tunggal yang menempatkan lapisan perutean cerdas di depan beberapa model bahasa besar (LLM) dan menyajikan hasilnya sebagai bot Telegram dan (opsional) bot Discord. Dirancang khusus untuk operator pribadi yang telah memiliki kunci API dari berbagai penyedia layanan dan menginginkan rantai pengalihan cadangan (fallback) otomatis yang konsisten alih-alih memilih penyedia secara manual setiap saat.

Router ini sadar akan batas kuota dan kecepatan (rate limits): memahami batas harian tiap penyedia dan menghitung jumlah permintaan per penyedia berdasarkan tanggal UTC di namespace KV. Saat penyedia mencapai batas hariannya, penyedia tersebut secara otomatis dinonaktifkan sementara dari rantai hingga tengah malam UTC, dan penyedia prioritas berikutnya akan mengambil alih tugas tanpa perlu intervensi operator.

### Fitur Utama (Features)

- **Tiga Mode Perutean Bersamaan** — Menetapkan penyedia default, menimpa per pesan dengan awalan (prefix), atau membandingkan semua penyedia aktif secara paralel.
- **Gerbang Kunci API** — Penyedia hanya aktif jika kunci API terkait tersedia di brankas rahasia Worker. Workers AI selalu aktif tanpa memerlukan kunci API.
- **Pelacakan Kuota Harian Akurat** — Setiap permintaan menambah penghitung per penyedia di KV; router secara otomatis melewati penyedia yang telah melampaui kuota harian.
- **Inti Independen dari Platform** — Modul parser, router, dan penyedia sama sekali tidak terikat dengan Telegram atau Discord. Adaptor mengubah muatan masuk menjadi struktur internal `Message` yang seragam.
- **Pemeriksaan Pemilik (Owner Gate) di Kedua Platform** — Permintaan Telegram dengan `from.id` yang salah diabaikan tanpa respon; interaksi Discord dari pengguna tidak dikenal ditolak dengan pesan kesalahan efemeral. URL webhook juga menyertakan rahasia jalur sebagai perlindungan mendalam.
- **Riwayat Percakapan per Pengguna** — Beberapa putaran obrolan terakhir (default 10) disimpan di KV sehingga interaksi terasa seperti percakapan nyata. Riwayat dapat dihapus kapan saja dengan perintah `/reset`.

### Tiga Mode Penggunaan (Three Modes)

Ketiga mode tersedia secara bersamaan dan dapat dipilih untuk setiap pesan:

```
Mode A — Tetapkan penyedia default:
    /ai groq          Pesan biasa berikutnya akan diarahkan melalui Groq.

Mode B — Timpa satu kali dengan awalan:
    !gemini halo      Hanya pesan ini yang dijawab oleh Gemini (default tidak berubah).

Mode C — Bandingkan semua penyedia aktif:
    ? apa itu X       atau  /all apa itu X
    Memanggil seluruh penyedia aktif secara paralel dan mengembalikan jawaban berlabel.
```

Teks biasa tanpa perintah atau awalan akan diarahkan ke penyedia default pengguna saat ini. Jika belum ada yang ditetapkan, rantai fallback otomatis akan dijalankan.

### Arsitektur Sistem (Architecture)

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

### Struktur Repositori (Repository Layout)

```
llm-router-bot/
├── package.json              Skrip npm: build (tsc), test (vitest), deploy, format
├── tsconfig.json             TypeScript ketat dengan allowImportingTsExtensions
├── wrangler.example.toml     Templat konfigurasi Cloudflare Worker
├── README.md                 Dokumen utama bahasa Inggris
├── LICENSE                   Lisensi MIT
├── CHANGELOG.md              Catatan riwayat perubahan
├── docs/locales/             Dokumentasi multibahasa (ko, zh-CN, es, hi, ar, pt-BR, ru, fr, id)
├── src/
│   ├── index.ts              Handler fetch utama (rute /, /tg/<secret>, /interactions)
│   ├── types.ts              Definisi tipe bersama: Env, Message, Provider, ParsedCommand
│   ├── parser.ts             Parser fungsi murni (perintah slash, awalan !, pintasan ?)
│   ├── router.ts             Dispatcher mode A/B/C, rantai fallback, dan penyimpanan sesi
│   ├── format.ts             Escape MarkdownV2 Telegram, Discord, dan pemotong 4096 karakter
│   ├── kv.ts                 Helper KV untuk status dan riwayat pengguna
│   ├── quota.ts              Penghitung harian kuota per penyedia dan snapshot
│   ├── platforms/
│   │   ├── telegram.ts       Adaptor Webhook Telegram, gerbang pemilik, dan pengiriman terpotong
│   │   └── discord.ts        Adaptor interaksi Discord, verifikasi Ed25519, respons tertunda, /llm
│   └── providers/
│       ├── index.ts          Pendaftaran penyedia, urutan prioritas, dan alias awalan
│       ├── workers-ai.ts     Binding Cloudflare env.AI (Llama 3.3 70B & 8B)
│       ├── groq.ts           Groq Chat Completions (Llama 3.3 70B)
│       ├── gemini.ts         Google AI Studio (Gemini 2.5 Flash & Pro)
│       ├── openrouter.ts     OpenRouter (DeepSeek R1 distill untuk penalaran)
│       ├── together.ts       Together AI (Qwen 2.5 72B multibahasa)
│       └── hf.ts             HuggingFace router (Llama 3.3 70B cadangan sekunder)
├── test/
│   ├── parser.test.ts        18 uji unit parser
│   ├── router.test.ts        9 uji unit router dan kontrol alur
│   └── format.test.ts        10 uji unit format pesan dan pemotongan
└── .github/workflows/
    ├── build.yml             tsc + wrangler deploy --dry-run
    └── test.yml              prettier --check + tsc + vitest
```

### Katalog Penyedia (Provider Catalogue)

Urutan prioritas default. Penyedia hanya aktif jika kunci API terkait ada dalam brankas rahasia Worker. `Workers AI` adalah satu-satunya entri yang selalu aktif tanpa kunci.

| # | ID | Model | Batas Harian | Catatan |
|---|---|---|---|---|
| 1 | `groq` | Llama 3.3 70B Versatile | 14.400 | Model utama berkecepatan tinggi |
| 2 | `workers-ai-70b` | Llama 3.3 70B Instruct (FP8 fast) | 10.000 | Tanpa kunci API (`env.AI`) |
| 3 | `gemini-flash` | Gemini 2.5 Flash | 250 | Fallback berkualitas tinggi |
| 4 | `deepseek-r1` | DeepSeek R1 distill (OpenRouter) | 50 | Unggul dalam penalaran logika |
| 5 | `workers-ai-8b` | Llama 3.1 8B Instruct | 10.000 | Cadangan ringan dan cepat |
| 6 | `together-qwen` | Qwen 2.5 72B Instruct Turbo | 600 | Spesialis multibahasa |
| 7 | `hf` | Llama 3.3 70B (HuggingFace router) | 1.000 | Cadangan bantuan |
| 8 | `gemini-pro` | Gemini 2.5 Pro | 50 | Khusus untuk tugas penalaran rumit |

### Panduan Memulai Cepat (Quick Start)

```bash
git clone https://github.com/GHSFS/llm-router-bot.git
cd llm-router-bot
npm install
npm test
npm run build

cp wrangler.example.toml wrangler.toml
# Edit wrangler.toml: isi ID KV dan TG_OWNER_ID Anda

npx wrangler kv namespace create SESSIONS
npx wrangler secret put TG_BOT_TOKEN
npx wrangler secret put TG_WEBHOOK_SECRET

npm run deploy
```

### Referensi Perintah Bot

```
/help              Menampilkan bantuan dan panduan penggunaan
/providers         Melihat daftar penyedia dan status keaktifannya
/quota             Melihat pemakaian kuota hari ini (waktu UTC)
/history           Melihat putaran percakapan terakhir
/reset             Menghapus riwayat dan mereset penyedia default
/ai <penyedia>     Mode A: Menetapkan penyedia default (mis: /ai groq)
/all <teks>        Mode C: Bertanya ke semua penyedia secara paralel
? <teks>           Pintasan untuk Mode C
!<awalan> <teks>   Mode B: Penimpaan satu kali untuk pesan tertentu
```

### Lisensi dan Batasan Tanggung Jawab

- **Lisensi**: MIT. Lihat [LICENSE](../../LICENSE) untuk detail selengkapnya.
- **Batasan Tanggung Jawab**: Alat ini ditujukan untuk penggunaan pribadi operator terhadap akun penyedia yang sah dimilikinya. Jangan sebarkan Worker ini sebagai layanan publik bersama.
