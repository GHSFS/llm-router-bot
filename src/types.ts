// Shared type definitions used across the worker.
//
// The router and parser are deliberately platform-agnostic: they only see
// `Message` and emit `ProviderResponse`s. Telegram- and Discord-specific
// concerns live exclusively in src/platforms/*.

export interface Env {
  // Workers AI binding (always available — no key required).
  AI: Ai;

  // KV namespace storing per-user state and per-provider quota counters.
  SESSIONS: KVNamespace;

  // Telegram — required.
  TG_BOT_TOKEN: string;
  TG_OWNER_ID: string;
  TG_WEBHOOK_SECRET: string;

  // Discord — optional. When DISCORD_OWNER_ID is empty the /dc/* route is a no-op.
  DISCORD_OWNER_ID?: string;
  DISCORD_APP_ID?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_WEBHOOK_SECRET?: string;

  // Provider keys — each one is optional. A provider is only enabled when
  // its key is present (Workers AI is the always-on exception).
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  TOGETHER_API_KEY?: string;
  HF_API_KEY?: string;

  // Optional configuration knobs read as plain strings from [vars].
  DISABLED_PROVIDERS?: string;
  HISTORY_TURNS?: string;
}

export type Platform = 'telegram' | 'discord';

// Internal, normalised representation of an inbound message.
// Both adapters convert their platform payload into this shape before
// handing it to the router.
export interface Message {
  platform: Platform;
  userId: string;
  chatId: string;
  text: string;
  // Used for replies on Telegram; ignored on Discord interactions.
  replyToMessageId?: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

// Persisted history turn — adds a timestamp for windowing/expiry.
export interface StoredTurn extends ChatTurn {
  ts: number;
}

export interface UserState {
  defaultProvider?: string;
  history: StoredTurn[];
  lastUsed?: number;
}

export interface ProviderResponse {
  provider: string;
  label: string;
  text: string;
  // Optional usage hints — populated when the upstream API returns them.
  inputTokens?: number;
  outputTokens?: number;
  // Populated when the call failed; `text` is then a human-readable error.
  error?: string;
}

export interface Provider {
  id: string;
  label: string;
  // Daily request ceiling enforced by quota.ts. null = unmetered.
  dailyLimit: number | null;
  // True if this provider is best reserved for reasoning-heavy prompts.
  reasoningStrong?: boolean;
  enabled: (env: Env) => boolean;
  call: (text: string, env: Env, history?: ChatTurn[]) => Promise<ProviderResponse>;
}

// Output of the command parser. The router pattern-matches on `kind`.
export type ParsedCommand =
  | { kind: 'plain'; text: string }
  | { kind: 'prefix-override'; provider: string; text: string }
  | { kind: 'compare-all'; text: string }
  | { kind: 'set-default'; provider: string }
  | { kind: 'reset' }
  | { kind: 'history' }
  | { kind: 'quota' }
  | { kind: 'providers' }
  | { kind: 'help' }
  | { kind: 'unknown'; raw: string };
