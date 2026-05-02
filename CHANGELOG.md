# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial Cloudflare Worker scaffold with TypeScript, strict tsconfig, and
  `wrangler deploy --dry-run` validation in CI.
- Platform adapters for Telegram (webhook) and Discord (interactions endpoint
  with Ed25519 signature verification).
- Provider registry with conditional enablement based on which API keys are
  present. Always-on Workers AI fallback via the `env.AI` binding.
- Three message routing modes:
  - Mode A: `/ai <provider>` sets the per-user default provider.
  - Mode B: `!<provider> <message>` overrides one message without touching state.
  - Mode C: `?` or `/all <message>` fans out to every enabled provider in
    parallel and returns a labelled comparison.
- KV-backed user state (default provider, conversation history) and per-provider
  daily quota counter.
- Telegram MarkdownV2 escape and 4096-char chunking helpers.
- Vitest suite covering the command parser, the router dispatch, and the
  format helpers.
- Bilingual+ README (English plus 한국어, 日本語, 中文, Русский, Tiếng Việt,
  Türkçe, Deutsch, Español, Português) and a deployment guide.

[Unreleased]: https://github.com/GHSFS/llm-router-bot/commits/main
