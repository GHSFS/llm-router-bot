// Daily per-provider request counter. Backed by KV so we get strong-enough
// rate-limit awareness without paying for Durable Objects.
//
// Each successful or failed dispatch increments the counter. The router asks
// `isUnderQuota` before calling a provider and skips it once the daily ceiling
// is reached.

import type { Env, Provider } from './types.ts';

interface QuotaEntry {
  count: number;
}

function todayUtc(): string {
  // YYYY-MM-DD. KV keys are UTC so the daily counter rolls over at 00:00 UTC,
  // which is also when most upstream providers reset their free-tier quotas.
  return new Date().toISOString().slice(0, 10);
}

function quotaKey(providerId: string, day: string = todayUtc()): string {
  return `quota:${providerId}:${day}`;
}

export async function getUsage(env: Env, providerId: string): Promise<number> {
  const raw = await env.SESSIONS.get(quotaKey(providerId), 'json');
  if (raw && typeof raw === 'object' && typeof (raw as QuotaEntry).count === 'number') {
    return (raw as QuotaEntry).count;
  }
  return 0;
}

export async function isUnderQuota(env: Env, provider: Provider): Promise<boolean> {
  if (provider.dailyLimit === null) return true;
  const used = await getUsage(env, provider.id);
  return used < provider.dailyLimit;
}

export async function incrementUsage(env: Env, providerId: string): Promise<void> {
  const key = quotaKey(providerId);
  const current = await getUsage(env, providerId);
  const next: QuotaEntry = { count: current + 1 };
  // 36-hour TTL so yesterday's counter is still readable for a few hours
  // (useful for the /quota command) but eventually evicted automatically.
  await env.SESSIONS.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 36 });
}

export async function snapshot(
  env: Env,
  providers: Provider[],
): Promise<Array<{ id: string; label: string; used: number; limit: number | null }>> {
  return Promise.all(
    providers.map(async (p) => ({
      id: p.id,
      label: p.label,
      used: await getUsage(env, p.id),
      limit: p.dailyLimit,
    })),
  );
}
