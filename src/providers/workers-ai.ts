// Cloudflare Workers AI providers. The `env.AI` binding is always present —
// no API key, no quota header, but the account is metered globally on
// neuron-hour usage. We treat 10,000 daily requests as a soft ceiling.

import type { ChatTurn, Env, Provider, ProviderResponse } from '../types.ts';

interface WorkersAiResponse {
  response?: string;
}

async function callWorkersAi(
  model: string,
  text: string,
  env: Env,
  history: ChatTurn[] | undefined,
  label: string,
  id: string,
): Promise<ProviderResponse> {
  const messages = [...(history ?? []), { role: 'user' as const, content: text }];
  try {
    const result = (await env.AI.run(model as never, { messages } as never)) as WorkersAiResponse;
    const out = result.response?.trim();
    if (!out) {
      return { provider: id, label, text: '(empty response)', error: 'empty' };
    }
    return { provider: id, label, text: out };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider: id, label, text: `Workers AI error: ${msg}`, error: msg };
  }
}

export const workersAi70b: Provider = {
  id: 'workers-ai-70b',
  label: 'Workers AI · Llama 3.3 70B',
  dailyLimit: 10_000,
  enabled: () => true,
  call: (text, env, history) =>
    callWorkersAi(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      text,
      env,
      history,
      'Workers AI · Llama 3.3 70B',
      'workers-ai-70b',
    ),
};

export const workersAi8b: Provider = {
  id: 'workers-ai-8b',
  label: 'Workers AI · Llama 3.1 8B',
  dailyLimit: 10_000,
  enabled: () => true,
  call: (text, env, history) =>
    callWorkersAi(
      '@cf/meta/llama-3.1-8b-instruct',
      text,
      env,
      history,
      'Workers AI · Llama 3.1 8B',
      'workers-ai-8b',
    ),
};
