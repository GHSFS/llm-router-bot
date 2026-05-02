import { beforeEach, describe, expect, it } from 'vitest';
import { route } from '../src/router.ts';
import type { Env, Message } from '../src/types.ts';

// Minimal in-memory KV stub. Workers KV exposes get/put/delete/list and is
// awaited even for sync work, so this stub returns Promises throughout.
class MemoryKv {
  private store = new Map<string, string>();

  async get(key: string, type?: 'json' | 'text'): Promise<unknown> {
    const raw = this.store.get(key);
    if (raw === undefined) return null;
    if (type === 'json') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return raw;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  size(): number {
    return this.store.size;
  }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    AI: {} as never,
    SESSIONS: new MemoryKv() as unknown as KVNamespace,
    TG_BOT_TOKEN: 'test',
    TG_OWNER_ID: '1',
    TG_WEBHOOK_SECRET: 'test',
    ...overrides,
  };
}

function makeMessage(text: string): Message {
  return { platform: 'telegram', userId: '1', chatId: '1', text };
}

describe('router — control commands', () => {
  let env: Env;
  beforeEach(() => {
    env = makeEnv();
  });

  it('/help returns the help text', async () => {
    const result = await route(makeMessage('/help'), env);
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0]).toMatch(/usage/i);
  });

  it('/providers lists every provider with a status', async () => {
    const result = await route(makeMessage('/providers'), env);
    expect(result.replies[0]).toMatch(/groq/);
    expect(result.replies[0]).toMatch(/workers-ai-70b/);
    expect(result.replies[0]).toMatch(/gemini/);
  });

  it('/quota returns a usage table', async () => {
    const result = await route(makeMessage('/quota'), env);
    expect(result.replies[0]).toMatch(/Today/);
    expect(result.replies[0]).toMatch(/groq/);
  });

  it('/reset clears the user state', async () => {
    const kv = env.SESSIONS as unknown as MemoryKv;
    await env.SESSIONS.put(
      'user:telegram:1',
      JSON.stringify({ history: [{ role: 'user', content: 'hi', ts: 0 }] }),
    );
    expect(kv.size()).toBe(1);
    const result = await route(makeMessage('/reset'), env);
    expect(result.replies[0]).toMatch(/cleared/i);
    expect(kv.size()).toBe(0);
  });

  it('/ai with an unknown provider rejects', async () => {
    const result = await route(makeMessage('/ai banana'), env);
    expect(result.replies[0]).toMatch(/unknown provider/i);
  });

  it('/ai with a provider whose key is missing rejects', async () => {
    // groq is disabled by default (no GROQ_API_KEY)
    const result = await route(makeMessage('/ai groq'), env);
    expect(result.replies[0]).toMatch(/not currently enabled/i);
  });

  it('/history says no history when empty', async () => {
    const result = await route(makeMessage('/history'), env);
    expect(result.replies[0]).toMatch(/no history/i);
  });

  it('returns a help hint for an unknown command', async () => {
    const result = await route(makeMessage('/banana'), env);
    expect(result.replies[0]).toMatch(/\/help/i);
  });
});

describe('router — Mode B prefix override against disabled provider', () => {
  it('rejects when the chosen provider has no key', async () => {
    const env = makeEnv();
    const result = await route(makeMessage('!groq hi there'), env);
    expect(result.replies[0]).toMatch(/not enabled/i);
  });
});
