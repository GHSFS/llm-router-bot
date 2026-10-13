import { describe, expect, it } from 'vitest';
import { chunkForTelegram, escapeDiscord, escapeTelegram, labelledSection } from '../src/format.ts';

describe('escapeTelegram', () => {
  it('escapes every reserved MarkdownV2 character', () => {
    const reserved = '_*[]()~`>#+-=|{}.!\\';
    const escaped = escapeTelegram(reserved);
    for (const ch of reserved) {
      expect(escaped).toContain('\\' + ch);
    }
  });

  it('leaves ordinary text alone', () => {
    expect(escapeTelegram('hello world')).toBe('hello world');
    expect(escapeTelegram('한국어 テスト 中文')).toBe('한국어 テスト 中文');
  });

  it('handles a multi-line message with code-fence syntax', () => {
    const out = escapeTelegram('```js\nconst x = 1.5;\nconsole.log(x);\n```');
    expect(out).toContain('\\`');
    expect(out).toContain('\\.');
    expect(out).toContain('\\=');
  });
});

describe('escapeDiscord', () => {
  it('escapes the markdown emphasis set', () => {
    expect(escapeDiscord('*bold*')).toBe('\\*bold\\*');
    expect(escapeDiscord('`code`')).toBe('\\`code\\`');
    expect(escapeDiscord('~~strike~~')).toBe('\\~\\~strike\\~\\~');
    expect(escapeDiscord('| pipe |')).toBe('\\| pipe \\|');
  });

  it('does not over-escape ordinary punctuation', () => {
    expect(escapeDiscord('hello, world! (parens)')).toBe('hello, world! (parens)');
  });
});

describe('chunkForTelegram', () => {
  it('returns the input unchanged when under the limit', () => {
    expect(chunkForTelegram('short')).toEqual(['short']);
  });

  it('splits long input into multiple parts under the limit', () => {
    const long = 'a'.repeat(5000);
    const parts = chunkForTelegram(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(4096);
    }
    expect(parts.join('')).toBe(long);
  });

  it('prefers paragraph boundaries when available', () => {
    const limit = 100;
    const paragraph1 = 'a'.repeat(60);
    const paragraph2 = 'b'.repeat(60);
    const text = `${paragraph1}\n\n${paragraph2}`;
    const parts = chunkForTelegram(text, limit);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toBe(paragraph1);
    expect(parts[1]).toBe(paragraph2);
  });

  it('falls back to a hard cut when no whitespace is present', () => {
    const text = 'x'.repeat(150);
    const parts = chunkForTelegram(text, 100);
    expect(parts.length).toBe(2);
    expect(parts[0]).toHaveLength(100);
    expect(parts[1]).toHaveLength(50);
  });
});

describe('labelledSection', () => {
  it('formats a header + body', () => {
    expect(labelledSection('Groq', 'hello there')).toBe('*Groq*\nhello there');
  });
});
