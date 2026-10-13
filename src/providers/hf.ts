// HuggingFace Inference API — auxiliary fallback.
//
// We use the OpenAI-compatible router endpoint introduced in late 2024,
// which exposes a Chat Completions surface across hosted models. This avoids
// the per-model URL switching that the legacy Inference API requires.

import type { ChatTurn, Env, Provider, ProviderResponse } from '../types.ts';

const ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const MODEL = 'meta-llama/Llama-3.3-70B-Instruct';
const ID = 'hf';
const LABEL = 'HuggingFace · Llama 3.3 70B';

interface OpenAiCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export const huggingFace: Provider = {
  id: ID,
  label: LABEL,
  dailyLimit: 1_000,
  enabled: (env) => Boolean(env.HF_API_KEY),
  async call(text, env, history): Promise<ProviderResponse> {
    if (!env.HF_API_KEY) {
      return { provider: ID, label: LABEL, text: 'HuggingFace disabled', error: 'no-key' };
    }
    const messages = [...(history ?? []), { role: 'user', content: text }];
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.HF_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.7 }),
      });
      const json = (await res.json()) as OpenAiCompletion;
      if (!res.ok) {
        const msg = json.error?.message ?? `HTTP ${res.status}`;
        return { provider: ID, label: LABEL, text: `HuggingFace error: ${msg}`, error: msg };
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
      return { provider: ID, label: LABEL, text: `HuggingFace error: ${msg}`, error: msg };
    }
  },
};
