// Together AI — OpenAI-compatible. Qwen 2.5 72B Instruct Turbo is a strong
// multilingual baseline well-suited for non-English prompts.

import type { ChatTurn, Env, Provider, ProviderResponse } from '../types.ts';

const ENDPOINT = 'https://api.together.xyz/v1/chat/completions';
const MODEL = 'Qwen/Qwen2.5-72B-Instruct-Turbo';
const ID = 'together-qwen';
const LABEL = 'Together · Qwen 2.5 72B';

interface OpenAiCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export const togetherQwen: Provider = {
  id: ID,
  label: LABEL,
  dailyLimit: 600,
  enabled: (env) => Boolean(env.TOGETHER_API_KEY),
  async call(text, env, history): Promise<ProviderResponse> {
    if (!env.TOGETHER_API_KEY) {
      return { provider: ID, label: LABEL, text: 'Together disabled', error: 'no-key' };
    }
    const messages = [...(history ?? []), { role: 'user', content: text }];
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.TOGETHER_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.7 }),
      });
      const json = (await res.json()) as OpenAiCompletion;
      if (!res.ok) {
        const msg = json.error?.message ?? `HTTP ${res.status}`;
        return { provider: ID, label: LABEL, text: `Together error: ${msg}`, error: msg };
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
      return { provider: ID, label: LABEL, text: `Together error: ${msg}`, error: msg };
    }
  },
};
