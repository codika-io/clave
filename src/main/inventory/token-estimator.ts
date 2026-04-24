// src/main/inventory/token-estimator.ts

const DEFAULT_CONTEXT_WINDOW = 200_000
const EXTENDED_CONTEXT_WINDOW = 1_000_000

const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-7': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000
}

export function estimateTokens(content: string): number {
  if (!content) return 0
  return Math.ceil(content.length / 4)
}

/**
 * Resolve a model id to its context window size.
 *
 * CC appends a `[1m]` tag to the id when the session is running in extended
 * 1M-context mode (e.g. `claude-opus-4-7[1m]`) — detect it and return 1M
 * regardless of the base model. Without the tag, fall back to per-model
 * limits (all current Claude 4.x families default to 200k).
 */
export function contextWindowFor(model: string | undefined): number {
  if (!model) return DEFAULT_CONTEXT_WINDOW
  const normalized = model.toLowerCase()
  if (/\[1m\]$/.test(normalized)) return EXTENDED_CONTEXT_WINDOW
  for (const [key, value] of Object.entries(CONTEXT_WINDOWS)) {
    if (normalized.includes(key)) return value
  }
  return DEFAULT_CONTEXT_WINDOW
}
