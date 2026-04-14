// src/main/inventory/token-estimator.ts

const DEFAULT_CONTEXT_WINDOW = 200_000

const CONTEXT_WINDOWS: Record<string, number> = {
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

export function contextWindowFor(model: string | undefined): number {
  if (!model) return DEFAULT_CONTEXT_WINDOW
  const normalized = model.toLowerCase()
  for (const [key, value] of Object.entries(CONTEXT_WINDOWS)) {
    if (normalized.includes(key)) return value
  }
  return DEFAULT_CONTEXT_WINDOW
}
