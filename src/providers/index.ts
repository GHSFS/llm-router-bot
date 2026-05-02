// Provider registry.
//
// ALL_PROVIDERS is the canonical priority order — earlier entries are tried
// first by the auto-fallback chain. The order balances quality against the
// daily ceiling so the user gets a coherent answer most of the time without
// burning the small premium quotas (Gemini Pro, DeepSeek R1) on trivial
// requests.
//
// `enabled()` filters by API-key presence at request time, and quota.ts
// further filters by daily count.

import type { Env, Provider } from '../types.ts';
import { workersAi70b, workersAi8b } from './workers-ai.ts';
import { groq } from './groq.ts';
import { geminiFlash, geminiPro } from './gemini.ts';
import { deepseekR1 } from './openrouter.ts';
import { togetherQwen } from './together.ts';
import { huggingFace } from './hf.ts';

export const ALL_PROVIDERS: Provider[] = [
  groq,
  workersAi70b,
  geminiFlash,
  deepseekR1,
  workersAi8b,
  togetherQwen,
  huggingFace,
  geminiPro,
];

// User-typed prefix → provider id. Prefixes are case-insensitive and matched
// before any provider call. The router converts e.g. "!gemini hello" to a
// prefix-override on `gemini-flash`.
export const PREFIX_ALIASES: Record<string, string> = {
  groq: 'groq',
  llama: 'workers-ai-70b',
  cf: 'workers-ai-70b',
  'workers-ai': 'workers-ai-70b',
  'workers-70b': 'workers-ai-70b',
  'workers-8b': 'workers-ai-8b',
  gemini: 'gemini-flash',
  'gemini-flash': 'gemini-flash',
  'gemini-pro': 'gemini-pro',
  pro: 'gemini-pro',
  deepseek: 'deepseek-r1',
  r1: 'deepseek-r1',
  qwen: 'together-qwen',
  together: 'together-qwen',
  hf: 'hf',
  huggingface: 'hf',
};

export function disabledIds(env: Env): Set<string> {
  const raw = env.DISABLED_PROVIDERS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function enabledProviders(env: Env): Provider[] {
  const blocked = disabledIds(env);
  return ALL_PROVIDERS.filter((p) => p.enabled(env) && !blocked.has(p.id));
}

export function findProvider(id: string): Provider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export function resolvePrefix(prefix: string): string | undefined {
  return PREFIX_ALIASES[prefix.toLowerCase()];
}
