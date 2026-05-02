// Google Gemini — generateContent endpoint. Two flavours:
//   - gemini-2.5-flash   (250 req/day free tier, fast)
//   - gemini-2.5-pro     (50  req/day free tier, premium)

import type { ChatTurn, Env, Provider, ProviderResponse } from '../types.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

function toGeminiContents(history: ChatTurn[] | undefined, text: string): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const turn of history ?? []) {
    if (turn.role === 'system') continue; // Gemini handles system via systemInstruction
    out.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    });
  }
  out.push({ role: 'user', parts: [{ text }] });
  return out;
}

async function callGemini(
  model: string,
  id: string,
  label: string,
  text: string,
  env: Env,
  history: ChatTurn[] | undefined,
): Promise<ProviderResponse> {
  if (!env.GEMINI_API_KEY) {
    return { provider: id, label, text: 'Gemini disabled', error: 'no-key' };
  }
  const url = `${BASE}/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: toGeminiContents(history, text) }),
    });
    const json = (await res.json()) as GeminiResponse;
    if (!res.ok) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      return { provider: id, label, text: `Gemini error: ${msg}`, error: msg };
    }
    const out = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();
    if (!out) {
      return { provider: id, label, text: '(empty response)', error: 'empty' };
    }
    return {
      provider: id,
      label,
      text: out,
      ...(json.usageMetadata?.promptTokenCount !== undefined
        ? { inputTokens: json.usageMetadata.promptTokenCount }
        : {}),
      ...(json.usageMetadata?.candidatesTokenCount !== undefined
        ? { outputTokens: json.usageMetadata.candidatesTokenCount }
        : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider: id, label, text: `Gemini error: ${msg}`, error: msg };
  }
}

export const geminiFlash: Provider = {
  id: 'gemini-flash',
  label: 'Gemini 2.5 Flash',
  dailyLimit: 250,
  enabled: (env) => Boolean(env.GEMINI_API_KEY),
  call: (text, env, history) =>
    callGemini('gemini-2.5-flash', 'gemini-flash', 'Gemini 2.5 Flash', text, env, history),
};

export const geminiPro: Provider = {
  id: 'gemini-pro',
  label: 'Gemini 2.5 Pro',
  dailyLimit: 50,
  reasoningStrong: true,
  enabled: (env) => Boolean(env.GEMINI_API_KEY),
  call: (text, env, history) =>
    callGemini('gemini-2.5-pro', 'gemini-pro', 'Gemini 2.5 Pro', text, env, history),
};
