// Discord interactions adapter.
//
// Discord requires every incoming interaction request to carry an Ed25519
// signature derived from the bot's public key. We must verify it with
// crypto.subtle before doing any work, and we must respond within 3 seconds
// or Discord considers the interaction failed. To stay under that budget
// even when an LLM is slow, we send DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
// (type 5) immediately and use ctx.waitUntil() to PATCH the actual reply
// onto the original interaction once it arrives.
//
// One slash command is registered: `/llm <text>`. The text is then parsed
// by the same parser.ts as Telegram, so all three modes (A/B/C) are
// available inside a single Discord slash invocation:
//
//   /llm message:hello world          plain
//   /llm message:? what is quantum?   compare-all
//   /llm message:!gemini hi           prefix override
//   /llm message:/ai groq             set default

import type { Env, Message } from '../types.ts';
import { route } from '../router.ts';
import { chunkForTelegram, escapeDiscord } from '../format.ts';

const DISCORD_BASE = 'https://discord.com/api/v10';

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

interface DiscordInteractionUser {
  id: string;
}

interface DiscordInteractionMember {
  user: DiscordInteractionUser;
}

interface DiscordOption {
  name: string;
  type: number;
  value?: string | number | boolean;
}

interface DiscordInteractionData {
  name: string;
  options?: DiscordOption[];
}

interface DiscordInteraction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  channel_id?: string;
  user?: DiscordInteractionUser;
  member?: DiscordInteractionMember;
  data?: DiscordInteractionData;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('odd hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function verifySignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(publicKeyHex),
      { name: 'Ed25519' } as never,
      false,
      ['verify'],
    );
    const data = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify('Ed25519' as never, key, hexToBytes(signatureHex), data);
  } catch {
    return false;
  }
}

function getUserId(i: DiscordInteraction): string | undefined {
  return i.user?.id ?? i.member?.user.id;
}

function getMessageOption(i: DiscordInteraction): string {
  const opt = i.data?.options?.find((o) => o.name === 'message');
  return typeof opt?.value === 'string' ? opt.value : '';
}

async function followUp(env: Env, interactionToken: string, content: string): Promise<void> {
  if (!env.DISCORD_APP_ID) return;
  const url = `${DISCORD_BASE}/webhooks/${env.DISCORD_APP_ID}/${interactionToken}/messages/@original`;
  const escaped = escapeDiscord(content);
  // Discord caps message content at 2000 chars. Use the same chunker but
  // with a tighter limit; first chunk goes via PATCH @original, rest via POST.
  const chunks = chunkForTelegram(escaped, 2000);
  const [first = '', ...rest] = chunks;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: first }),
  });
  const followUpUrl = `${DISCORD_BASE}/webhooks/${env.DISCORD_APP_ID}/${interactionToken}`;
  for (const chunk of rest) {
    await fetch(followUpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: chunk }),
    });
  }
}

export async function handleDiscord(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!env.DISCORD_PUBLIC_KEY || !env.DISCORD_OWNER_ID) {
    return new Response('discord disabled', { status: 503 });
  }
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!signature || !timestamp) {
    return new Response('missing signature', { status: 401 });
  }
  const body = await request.text();
  const ok = await verifySignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, body);
  if (!ok) return new Response('bad signature', { status: 401 });

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (interaction.type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'unsupported interaction type' },
    });
  }

  const userId = getUserId(interaction);
  if (!userId || userId !== env.DISCORD_OWNER_ID) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'not authorised', flags: 64 },
    });
  }

  const text = getMessageOption(interaction);
  if (!text) {
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'message option is required', flags: 64 },
    });
  }

  const message: Message = {
    platform: 'discord',
    userId,
    chatId: interaction.channel_id ?? userId,
    text,
  };

  // Defer the response so we have up to 15 minutes to reply.
  ctx.waitUntil(
    (async () => {
      try {
        const result = await route(message, env);
        const merged = result.replies.join('\n\n');
        await followUp(env, interaction.token, merged);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await followUp(env, interaction.token, `Internal error: ${msg}`);
      }
    })(),
  );

  return Response.json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
}
