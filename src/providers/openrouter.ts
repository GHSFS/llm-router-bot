// OpenRouter — OpenAI-compatible gateway in front of many models.
// We point at DeepSeek R1 distill, a free reasoning-strong model at
// 50 requests/day on free-tier accounts.

import type { ChatTurn, Env, Provider, ProviderResponse } from '../types.ts';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'deepseek/deepseek-r1-distill-llama-70b:free';
const ID = 'deepseek-r1';
const LABEL = 'DeepSeek R1 (OpenRouter)';

interface OpenAiCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export const deepseekR1: Provider = {
  id: ID,
  label: LABEL,
  dailyLimit: 50,
  reasoningStrong: true,
  enabled: (env) => Boolean(env.OPENROUTER_API_KEY),
  async call(text, env, history): Promise<ProviderResponse> {
    if (!env.OPENROUTER_API_KEY) {
      return { provider: ID, label: LABEL, text: 'OpenRouter disabled', error: 'no-key' };
    }
    const messages = [...(history ?? []), { role: 'user', content: text }];
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          // OpenRouter likes a referer/title for free-tier attribution.
          'http-referer': 'https://github.com/GHSFS/llm-router-bot',
          'x-title': 'llm-router-bot',
        },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.7 }),
      });
      const json = (await res.json()) as OpenAiCompletion;
      if (!res.ok) {
        const msg = json.error?.message ?? `HTTP ${res.status}`;
        return { provider: ID, label: LABEL, text: `OpenRouter error: ${msg}`, error: msg };
      }
      const out = json.choices?.[0]?.message?.content?.trim();
      if (!out) {
        return { provider: ID, label: LABEL, text: '(empty response)', error: 'empty' };
      }
      return {
        provider: ID,
        label: LABEL,
        text: out,
        ...(json.usage?.prompt_tokens !== undefined
          ? { inputTokens: json.usage.prompt_tokens }
          : {}),
        ...(json.usage?.completion_tokens !== undefined
          ? { outputTokens: json.usage.completion_tokens }
          : {}),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { provider: ID, label: LABEL, text: `OpenRouter error: ${msg}`, error: msg };
    }
  },
};
