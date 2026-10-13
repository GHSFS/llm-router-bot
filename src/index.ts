// Cloudflare Worker entrypoint.
//
// Routes:
//   GET  /              health probe (returns plaintext version line)
//   POST /tg/<secret>   Telegram webhook  (URL-path secret check)
//   POST /interactions  Discord interactions  (Ed25519 signature check)
//
// All other URLs return 404. The bot is a single-user tool; we deliberately
// expose no admin or status endpoints to the public internet.

import type { Env } from './types.ts';
import { handleTelegram } from './platforms/telegram.ts';
import { handleDiscord } from './platforms/discord.ts';

const VERSION = '0.1.0';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(`llm-router-bot ${VERSION}\n`, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (request.method === 'POST' && url.pathname.startsWith('/tg/')) {
      const secret = url.pathname.slice('/tg/'.length);
      return handleTelegram(request, env, secret);
    }

    if (request.method === 'POST' && url.pathname === '/interactions') {
      return handleDiscord(request, env, ctx);
    }

    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
