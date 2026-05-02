// Per-user state and per-provider quota stored in the SESSIONS KV namespace.
//
// Key shape:
//   user:<platform>:<userId>      -> UserState (JSON)
//   quota:<providerId>:<YYYY-MM-DD> -> { count: number } (JSON)

import type { Env, Platform, UserState, StoredTurn, ChatTurn } from './types.ts';

const DEFAULT_HISTORY_TURNS = 10;

function userKey(platform: Platform, userId: string): string {
  return `user:${platform}:${userId}`;
}

export async function loadUserState(
  env: Env,
  platform: Platform,
  userId: string,
): Promise<UserState> {
  const raw = await env.SESSIONS.get(userKey(platform, userId), 'json');
  if (raw && typeof raw === 'object') {
    const candidate = raw as Partial<UserState>;
    const state: UserState = {
      history: Array.isArray(candidate.history) ? candidate.history : [],
    };
    if (candidate.defaultProvider !== undefined) state.defaultProvider = candidate.defaultProvider;
    if (candidate.lastUsed !== undefined) state.lastUsed = candidate.lastUsed;
    return state;
  }
  return { history: [] };
}

export async function saveUserState(
  env: Env,
  platform: Platform,
  userId: string,
  state: UserState,
): Promise<void> {
  await env.SESSIONS.put(userKey(platform, userId), JSON.stringify(state));
}

export async function setDefaultProvider(
  env: Env,
  platform: Platform,
  userId: string,
  providerId: string,
): Promise<void> {
  const state = await loadUserState(env, platform, userId);
  state.defaultProvider = providerId;
  state.lastUsed = Date.now();
  await saveUserState(env, platform, userId, state);
}

export async function resetUser(env: Env, platform: Platform, userId: string): Promise<void> {
  await env.SESSIONS.delete(userKey(platform, userId));
}

export async function appendHistory(
  env: Env,
  platform: Platform,
  userId: string,
  userTurn: ChatTurn,
  assistantTurn: ChatTurn,
  maxTurns: number = DEFAULT_HISTORY_TURNS,
): Promise<void> {
  const state = await loadUserState(env, platform, userId);
  const now = Date.now();
  const next: StoredTurn[] = [
    ...state.history,
    { ...userTurn, ts: now },
    { ...assistantTurn, ts: now },
  ];
  // Drop the oldest pair until the window fits. Each turn = one user + one
  // assistant message, so the cap is doubled internally.
  const cap = maxTurns * 2;
  while (next.length > cap) next.shift();
  state.history = next;
  state.lastUsed = now;
  await saveUserState(env, platform, userId, state);
}

export function historyTurnsFromEnv(env: Env): number {
  const raw = env.HISTORY_TURNS;
  if (!raw) return DEFAULT_HISTORY_TURNS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HISTORY_TURNS;
}
