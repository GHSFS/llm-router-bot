// Telegram webhook adapter.
//
// Telegram delivers each user message as a POST to our webhook URL. We
// require the URL path to contain TG_WEBHOOK_SECRET so unsolicited POSTs
// from the open internet are rejected before any work is done.
//
// Replies go back through the Bot API sendMessage endpoint, escaped against
// MarkdownV2 and split to fit Telegram's 4096-char ceiling.

import type { Env, Message } from '../types.ts';
import { route } from '../router.ts';
import { chunkForTelegram, escapeTelegram } from '../format.ts';

interface TelegramUser {
  id: number;
}

interface TelegramChat {
  id: number;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

const API_BASE = 'https://api.telegram.org';

async function sendMessage(env: Env, chatId: string, text: string): Promise<void> {
  const url = `${API_BASE}/bot${env.TG_BOT_TOKEN}/sendMessage`;
  const escaped = escapeTelegram(text);
  for (const chunk of chunkForTelegram(escaped)) {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
    });
  }
}

export async function handleTelegram(
  request: Request,
  env: Env,
  urlSecret: string,
): Promise<Response> {
  if (urlSecret !== env.TG_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const incoming = update.message ?? update.edited_message ?? update.channel_post;
  if (!incoming || !incoming.text || !incoming.from) {
    // Quietly accept other update types so Telegram doesn't retry forever.
    return new Response('ok');
  }
  if (String(incoming.from.id) !== env.TG_OWNER_ID) {
    // Single-user gate. Don't even send a reply — silent drop.
    return new Response('ok');
  }

  const message: Message = {
    platform: 'telegram',
    userId: String(incoming.from.id),
    chatId: String(incoming.chat.id),
    text: incoming.text,
    replyToMessageId: String(incoming.message_id),
  };

  const result = await route(message, env);
  for (const reply of result.replies) {
    await sendMessage(env, message.chatId, reply);
  }
  return new Response('ok');
}
