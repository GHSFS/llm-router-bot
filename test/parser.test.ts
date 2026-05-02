import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.ts';

describe('parser — slash commands', () => {
  it('parses /help', () => {
    expect(parse('/help')).toEqual({ kind: 'help' });
    expect(parse('/start')).toEqual({ kind: 'help' });
  });

  it('parses /reset', () => {
    expect(parse('/reset')).toEqual({ kind: 'reset' });
  });

  it('parses /history /quota /providers', () => {
    expect(parse('/history')).toEqual({ kind: 'history' });
    expect(parse('/quota')).toEqual({ kind: 'quota' });
    expect(parse('/usage')).toEqual({ kind: 'quota' });
    expect(parse('/providers')).toEqual({ kind: 'providers' });
    expect(parse('/list')).toEqual({ kind: 'providers' });
  });

  it('strips @botname suffix from group commands', () => {
    expect(parse('/help@MyBot')).toEqual({ kind: 'help' });
    expect(parse('/ai@MyBot groq')).toEqual({ kind: 'set-default', provider: 'groq' });
  });

  it('parses /ai with provider id and prefix alias', () => {
    expect(parse('/ai groq')).toEqual({ kind: 'set-default', provider: 'groq' });
    expect(parse('/ai gemini')).toEqual({ kind: 'set-default', provider: 'gemini-flash' });
    expect(parse('/ai r1')).toEqual({ kind: 'set-default', provider: 'deepseek-r1' });
  });

  it('rejects /ai with no argument', () => {
    expect(parse('/ai').kind).toBe('unknown');
  });

  it('parses /all <text> as compare-all', () => {
    expect(parse('/all what is the airspeed of a swallow?')).toEqual({
      kind: 'compare-all',
      text: 'what is the airspeed of a swallow?',
    });
    expect(parse('/compare hi')).toEqual({ kind: 'compare-all', text: 'hi' });
  });

  it('returns unknown for an unrecognised slash command', () => {
    expect(parse('/banana').kind).toBe('unknown');
  });
});

describe('parser — prefix override', () => {
  it('parses !groq <text>', () => {
    expect(parse('!groq hello')).toEqual({
      kind: 'prefix-override',
      provider: 'groq',
      text: 'hello',
    });
  });

  it('resolves prefix aliases', () => {
    expect(parse('!gemini hi there')).toEqual({
      kind: 'prefix-override',
      provider: 'gemini-flash',
      text: 'hi there',
    });
    expect(parse('!r1 think about this')).toEqual({
      kind: 'prefix-override',
      provider: 'deepseek-r1',
      text: 'think about this',
    });
  });

  it('rejects an unknown prefix', () => {
    expect(parse('!nope hello').kind).toBe('unknown');
  });

  it('rejects a prefix with no body', () => {
    expect(parse('!groq').kind).toBe('unknown');
    expect(parse('!groq   ').kind).toBe('unknown');
  });
});

describe('parser — compare-all shorthand', () => {
  it('parses "? <text>"', () => {
    expect(parse('? what is X')).toEqual({ kind: 'compare-all', text: 'what is X' });
  });

  it('does not treat ?word as compare-all', () => {
    expect(parse('?why?')).toEqual({ kind: 'plain', text: '?why?' });
  });

  it('treats lone "?" as plain', () => {
    expect(parse('?')).toEqual({ kind: 'plain', text: '?' });
  });
});

describe('parser — plain', () => {
  it('returns plain for ordinary text', () => {
    expect(parse('hello there')).toEqual({ kind: 'plain', text: 'hello there' });
  });

  it('preserves multi-line content in plain', () => {
    const text = 'line one\nline two\nline three';
    expect(parse(text)).toEqual({ kind: 'plain', text });
  });

  it('returns unknown for empty input', () => {
    expect(parse('')).toEqual({ kind: 'unknown', raw: '' });
    expect(parse('   ')).toEqual({ kind: 'unknown', raw: '' });
  });
});
