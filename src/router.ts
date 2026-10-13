// Mode A/B/C dispatch.
//
// `route()` takes a normalised Message and returns one or more reply strings
// (already formatted for the source platform) plus any side effects against
// the KV store. Platform adapters are responsible only for delivering those
// replies as actual sendMessage / interaction-response calls.

import type { ChatTurn, Env, Message, ProviderResponse } from './types.ts';
import { parse } from './parser.ts';
import { ALL_PROVIDERS, enabledProviders, findProvider, resolvePrefix } from './providers/index.ts';
import {
  appendHistory,
  historyTurnsFromEnv,
  loadUserState,
  resetUser,
  setDefaultProvider,
} from './kv.ts';
import { incrementUsage, isUnderQuota, snapshot } from './quota.ts';

export interface RouteResult {
  // Pre-formatted reply messages. Adapter sends them sequentially.
  replies: string[];
}

// Walk the auto-fallback chain until one provider answers without an `error`.
// Skips providers that are disabled or already over their daily quota.
async function callWithFallback(
  msg: Message,
  env: Env,
  history: ChatTurn[],
): Promise<ProviderResponse> {
  const candidates = enabledProviders(env);
  if (candidates.length === 0) {
    return {
      provider: 'none',
      label: 'No providers',
      text: 'No LLM providers are configured. Add at least one *_API_KEY secret or rely on Workers AI.',
      error: 'no-providers',
    };
  }
  const errors: string[] = [];
  for (const provider of candidates) {
    if (!(await isUnderQuota(env, provider))) {
      errors.push(`${provider.label}: daily quota exhausted`);
      continue;
    }
    const result = await provider.call(msg.text, env, history);
    await incrementUsage(env, provider.id);
    if (!result.error) return result;
    errors.push(`${provider.label}: ${result.error}`);
  }
  return {
    provider: 'none',
    label: 'No providers',
    text: `All providers failed. Tried:\n${errors.join('\n')}`,
    error: 'all-failed',
  };
}

function helpText(): string {
  return [
    'llm-router-bot — usage',
    '',
    'Three modes (mix freely):',
    '  • Mode A  /ai <provider>   set your default provider',
    '  • Mode B  !<prefix> <msg>   one-shot override',
    '  • Mode C  ? <msg>  or  /all <msg>   ask every provider in parallel',
    '',
    'Other commands:',
    '  /providers   list providers and their enabled state',
    "  /quota       today's usage per provider",
    '  /history     last few turns of your conversation',
    '  /reset       clear stored history and default',
    '  /help        this message',
    '',
    'Plain messages route through your default provider, or the auto-',
    'fallback chain when no default is set. Provider order respects each',
    "service's daily limit so the small premium quotas are reserved for",
    'reasoning-heavy prompts.',
  ].join('\n');
}

function providersText(env: Env): string {
  const blocked = (env.DISABLED_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const lines = ALL_PROVIDERS.map((p) => {
    let status: string;
    if (blocked.includes(p.id)) status = 'disabled (env)';
    else if (!p.enabled(env)) status = 'no key';
    else status = 'on';
    const limit = p.dailyLimit === null ? '∞' : `${p.dailyLimit}/day`;
    return `  ${p.id.padEnd(18)} ${limit.padEnd(10)} ${status}`;
  });
  return [
    'Providers:',
    ...lines,
    '',
    'Aliases for ! and /ai: groq, gemini, gemini-pro, deepseek, qwen, hf, workers-ai.',
  ].join('\n');
}

async function quotaText(env: Env): Promise<string> {
  const rows = await snapshot(env, ALL_PROVIDERS);
  const lines = rows.map((r) => {
    const limit = r.limit === null ? '∞' : String(r.limit);
    return `  ${r.id.padEnd(18)} ${String(r.used).padStart(5)} / ${limit}`;
  });
  return ["Today's usage (UTC):", ...lines].join('\n');
}

async function historyText(env: Env, msg: Message): Promise<string> {
  const state = await loadUserState(env, msg.platform, msg.userId);
  if (state.history.length === 0) return 'No history yet.';
  const lines = state.history.slice(-10).map((t) => {
    const who = t.role === 'user' ? 'you' : t.role === 'assistant' ? 'bot' : 'sys';
    const oneLine = t.content.replace(/\s+/g, ' ').slice(0, 200);
    return `  [${who}] ${oneLine}`;
  });
  return ['Recent turns:', ...lines].join('\n');
}

export async function route(msg: Message, env: Env): Promise<RouteResult> {
  const parsed = parse(msg.text);

  switch (parsed.kind) {
    case 'help':
      return { replies: [helpText()] };

    case 'providers':
      return { replies: [providersText(env)] };

    case 'quota':
      return { replies: [await quotaText(env)] };

    case 'history':
      return { replies: [await historyText(env, msg)] };

    case 'reset':
      await resetUser(env, msg.platform, msg.userId);
      return { replies: ['Cleared default provider and history.'] };

    case 'set-default': {
      const id = resolvePrefix(parsed.provider) ?? parsed.provider;
      const provider = findProvider(id);
      if (!provider) {
        return {
          replies: [`Unknown provider "${parsed.provider}". Use /providers to see the list.`],
        };
      }
      if (!provider.enabled(env)) {
        return {
          replies: [`Provider "${id}" is not currently enabled (no API key set).`],
        };
      }
      await setDefaultProvider(env, msg.platform, msg.userId, id);
      return { replies: [`Default provider set to ${provider.label}.`] };
    }

    case 'prefix-override': {
      const provider = findProvider(parsed.provider);
      if (!provider || !provider.enabled(env)) {
        return { replies: [`Provider "${parsed.provider}" is not enabled.`] };
      }
      if (!(await isUnderQuota(env, provider))) {
        return {
          replies: [
            `${provider.label} has hit its daily quota. Try later or use a different prefix.`,
          ],
        };
      }
      const r = await provider.call(parsed.text, env);
      await incrementUsage(env, provider.id);
      return { replies: [`[${provider.label}]\n${r.text}`] };
    }

    case 'compare-all': {
      const candidates = enabledProviders(env);
      const tasks = candidates.map(async (p) => {
        if (!(await isUnderQuota(env, p))) {
          return { provider: p.id, label: p.label, text: '(skipped — quota exhausted)' };
        }
        const r = await p.call(parsed.text, env);
        await incrementUsage(env, p.id);
        return r;
      });
      const results = await Promise.all(tasks);
      if (results.length === 0) {
        return { replies: ['No providers available.'] };
      }
      const sections = results.map((r) => `[${r.label}]\n${r.text}`);
      return { replies: sections };
    }

    case 'plain': {
      const state = await loadUserState(env, msg.platform, msg.userId);
      const turns = historyTurnsFromEnv(env);
      const history: ChatTurn[] = state.history
        .slice(-turns * 2)
        .map((t) => ({ role: t.role, content: t.content }));

      let result: ProviderResponse;
      if (state.defaultProvider) {
        const provider = findProvider(state.defaultProvider);
        if (provider && provider.enabled(env) && (await isUnderQuota(env, provider))) {
          result = await provider.call(parsed.text, env, history);
          await incrementUsage(env, provider.id);
          if (result.error) result = await callWithFallback(msg, env, history);
        } else {
          result = await callWithFallback(msg, env, history);
        }
      } else {
        result = await callWithFallback(msg, env, history);
      }

      if (!result.error) {
        await appendHistory(
          env,
          msg.platform,
          msg.userId,
          { role: 'user', content: parsed.text },
          { role: 'assistant', content: result.text },
          turns,
        );
      }
      const tag = result.error ? '' : `[${result.label}]\n`;
      return { replies: [`${tag}${result.text}`] };
    }

    case 'unknown':
    default:
      return {
        replies: ['Did not recognise that command. Send /help for usage.'],
      };
  }
}
