// Groq — OpenAI-compatible Chat Completions endpoint.
// Free tier (as of 2026-01): 14,400 requests/day, 30/min.

import type { ChatTurn, Env, Provider, ProviderResponse } from '../types.ts';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const ID = 'groq';
const LABEL = 'Groq · Llama 3.3 70B';

interface OpenAiCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export const groq: Provider = {
  id: ID,
  label: LABEL,
  dailyLimit: 14_400,
  enabled: (env) => Boolean(env.GROQ_API_KEY),
  async call(text, env, history): Promise<ProviderResponse> {
    if (!env.GROQ_API_KEY) {
      return { provider: ID, label: LABEL, text: 'Groq disabled', error: 'no-key' };
    }
    const messages = [...(history ?? []), { role: 'user', content: text }];
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.7 }),
      });
      const json = (await res.json()) as OpenAiCompletion;
      if (!res.ok) {
        const msg = json.error?.message ?? `HTTP ${res.status}`;
        return { provider: ID, label: LABEL, text: `Groq error: ${msg}`, error: msg };
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
      return { provider: ID, label: LABEL, text: `Groq error: ${msg}`, error: msg };
    }
  },
};
