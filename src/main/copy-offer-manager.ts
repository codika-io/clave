import { randomUUID } from 'crypto'
import { clipboard } from 'electron'
import { broadcastToAllWindows } from './window-routing'

/**
 * Lifecycle for agent-offered copyable values — the outbound mirror of the
 * secret-request flow (secret-request-manager.ts brings a value FROM the user
 * without it entering the conversation; this hands a value TO the user without
 * them scraping it out of terminal output). Main owns the full values; the
 * renderer only ever receives previews. Copying happens here, straight from
 * the stored record to the OS clipboard, so the exact bytes are preserved.
 */

export interface CopyOffer {
  id: string
  callerSessionId: string
  label: string
  value: string
  sensitive: boolean
  createdAt: number
  copiedAt?: number
}

/** Renderer-facing shape: preview only, never the full value. */
export interface CopyOfferView {
  id: string
  callerSessionId: string
  label: string
  preview: string
  truncated: boolean
  lineCount: number
  charCount: number
  sensitive: boolean
  createdAt: number
  copiedAt?: number
}

const MAX_PER_SESSION = 20
const PREVIEW_LINES = 3
const PREVIEW_CHARS = 240

const offers = new Map<string, CopyOffer>()

function toView(offer: CopyOffer): CopyOfferView {
  const lines = offer.value.split('\n')
  const head = lines.slice(0, PREVIEW_LINES).join('\n')
  return {
    id: offer.id,
    callerSessionId: offer.callerSessionId,
    label: offer.label,
    // Sensitive values never leave main, not even as a preview.
    preview: offer.sensitive ? '' : head.slice(0, PREVIEW_CHARS),
    truncated: !offer.sensitive && (lines.length > PREVIEW_LINES || head.length > PREVIEW_CHARS),
    lineCount: lines.length,
    charCount: offer.value.length,
    sensitive: offer.sensitive,
    createdAt: offer.createdAt,
    ...(offer.copiedAt ? { copiedAt: offer.copiedAt } : {})
  }
}

export function listOfferViews(): CopyOfferView[] {
  return Array.from(offers.values())
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(toView)
}

function pushToRenderer(): void {
  // The offer surfaces a copy button in the offering tab's own header, which
  // may be in any window; broadcast so whichever window hosts that tab shows it.
  broadcastToAllWindows('copy-offer:changed', listOfferViews())
}

export function createOffer(input: {
  callerSessionId: string
  label: string
  value: string
  sensitive: boolean
}): CopyOffer {
  const offer: CopyOffer = {
    id: randomUUID(),
    callerSessionId: input.callerSessionId,
    label: input.label,
    value: input.value,
    sensitive: input.sensitive,
    createdAt: Date.now()
  }
  // Cap per session: drop the oldest offers of the same tab beyond the limit.
  const siblings = Array.from(offers.values())
    .filter((o) => o.callerSessionId === input.callerSessionId)
    .sort((a, b) => a.createdAt - b.createdAt)
  for (const stale of siblings.slice(0, Math.max(0, siblings.length - (MAX_PER_SESSION - 1)))) {
    offers.delete(stale.id)
  }
  offers.set(offer.id, offer)
  pushToRenderer()
  return offer
}

/** Copy the exact stored bytes to the OS clipboard and stamp the offer. */
export function copyOfferToClipboard(id: string): CopyOfferView {
  const offer = offers.get(id)
  if (!offer) throw new Error(`No copy offer "${id}"`)
  clipboard.writeText(offer.value)
  offer.copiedAt = Date.now()
  pushToRenderer()
  return toView(offer)
}

export function dismissOffer(id: string): void {
  if (offers.delete(id)) pushToRenderer()
}

export function dismissSessionOffers(callerSessionId: string): void {
  let changed = false
  for (const offer of offers.values()) {
    if (offer.callerSessionId === callerSessionId) {
      offers.delete(offer.id)
      changed = true
    }
  }
  if (changed) pushToRenderer()
}
