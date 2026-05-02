// Telegram MarkdownV2 escape and 4096-char chunking.
//
// MarkdownV2 reserves a fixed set of characters that must be backslash-escaped
// even outside code spans:  _ * [ ] ( ) ~ ` > # + - = | { } . !
//
// Discord's flavoured Markdown is far more forgiving — see escapeDiscord below.

const TG_RESERVED = /[_*[\]()~`>#+\-=|{}.!\\]/g;
const TG_LIMIT = 4096;

export function escapeTelegram(text: string): string {
  return text.replace(TG_RESERVED, '\\$&');
}

// Discord allows raw text far more freely; only backslash, backtick, and the
// Markdown emphasis characters need taming. Mentions are not auto-resolved
// inside ordinary message content from a bot.
const DC_RESERVED = /[\\*_`~|>]/g;

export function escapeDiscord(text: string): string {
  return text.replace(DC_RESERVED, '\\$&');
}

// Telegram caps any single sendMessage at 4096 UTF-16 code units. Callers
// should iterate the array and send each part as a separate message.
//
// The splitter prefers to break on a paragraph boundary, then on a line
// boundary, then on a word boundary, before resorting to a hard cut.
export function chunkForTelegram(text: string, limit: number = TG_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    let cut = slice.lastIndexOf('\n\n');
    if (cut < limit / 2) cut = slice.lastIndexOf('\n');
    if (cut < limit / 2) cut = slice.lastIndexOf(' ');
    if (cut <= 0) cut = limit;
    parts.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts;
}

// Compose a header+body block for a single provider's contribution to a
// /all comparison response. The header is bold-italic, the body is plain text.
//
// Caller is expected to escape both pieces against the destination platform's
// flavour of Markdown if needed.
export function labelledSection(label: string, body: string): string {
  return `*${label}*\n${body}`;
}
