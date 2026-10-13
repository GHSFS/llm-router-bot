// Command and prefix parser. Pure function: takes the raw text of a message
// and returns a ParsedCommand. Has no side effects and no IO.
//
// Recognised forms:
//   /ai <provider>      Mode A — set this user's default provider
//   /all <text>         Mode C — compare every enabled provider
//   ? <text>            Mode C — same as /all, lighter syntax
//   !<provider> <text>  Mode B — one-shot override against a provider
//   /reset              Wipe user state
//   /history            Show recent turns
//   /quota              Show daily usage per provider
//   /providers          List provider ids and enabled state
//   /help, /start       Help text
//   anything else       Plain message — routed via the user's default

import type { ParsedCommand } from './types.ts';
import { resolvePrefix } from './providers/index.ts';

// Telegram delivers group commands as "/ai@BotName"; strip the @suffix.
function stripBotMention(token: string): string {
  const at = token.indexOf('@');
  return at === -1 ? token : token.slice(0, at);
}

export function parse(input: string): ParsedCommand {
  const text = input.trim();
  if (text.length === 0) return { kind: 'unknown', raw: '' };

  // Slash commands. Split into command + rest at the first whitespace run.
  if (text.startsWith('/')) {
    const match = text.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
    if (!match) return { kind: 'unknown', raw: text };
    const [, cmdRaw = '', rest = ''] = match;
    const cmd = stripBotMention(cmdRaw).toLowerCase();
    const restTrim = rest.trim();
    switch (cmd) {
      case 'ai': {
        if (!restTrim) return { kind: 'unknown', raw: text };
        const id = resolvePrefix(restTrim) ?? restTrim.toLowerCase();
        return { kind: 'set-default', provider: id };
      }
      case 'all':
      case 'compare':
        if (!restTrim) return { kind: 'unknown', raw: text };
        return { kind: 'compare-all', text: restTrim };
      case 'reset':
        return { kind: 'reset' };
      case 'history':
        return { kind: 'history' };
      case 'quota':
      case 'usage':
        return { kind: 'quota' };
      case 'providers':
      case 'list':
        return { kind: 'providers' };
      case 'help':
      case 'start':
        return { kind: 'help' };
      default:
        return { kind: 'unknown', raw: text };
    }
  }

  // Prefix override:  !<provider> <message>
  if (text.startsWith('!')) {
    const match = text.match(/^!(\S+)\s+([\s\S]+)$/);
    if (!match) return { kind: 'unknown', raw: text };
    const [, prefix = '', body = ''] = match;
    const id = resolvePrefix(prefix);
    if (!id) return { kind: 'unknown', raw: text };
    const trimmed = body.trim();
    if (!trimmed) return { kind: 'unknown', raw: text };
    return { kind: 'prefix-override', provider: id, text: trimmed };
  }

  // Compare-all shorthand. Require whitespace or the rest of the string after
  // the leading "?" so we don't capture a single "?" or a normal question
  // like "?!" as a compare command.
  if (text.startsWith('?')) {
    const rest = text.slice(1).trim();
    if (rest.length === 0) return { kind: 'plain', text };
    // Only treat as compare-all when "?" is separated from content by
    // whitespace OR the next char is a non-letter (so "?!" stays plain).
    const next = text[1];
    if (next === ' ' || next === '\t' || next === '\n') {
      return { kind: 'compare-all', text: rest };
    }
    // Otherwise fall through to plain — keeps "?why?" intact as a question.
    return { kind: 'plain', text };
  }

  return { kind: 'plain', text };
}
