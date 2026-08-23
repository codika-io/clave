/**
 * The provenance header Clave stamps on every cross-tab message delivery, and
 * the matcher that recognizes it again in a session's transcript.
 *
 * ONE source of truth on purpose. The renderer BUILDS the header when
 * delivering (`mcp-dispatcher.handleSendToSession`), and `hasProvenanceHeader`
 * is the matcher any reader of a transcript uses to tell a sibling agent's
 * delivery from something the human typed (the in-app conversation view that
 * used it went with the clave_read_exchanges tool; the exos side reads the
 * record instead). A hand-typed second copy of this string would drift, and
 * the failure is silent in the worst direction: an unmatched header makes a
 * sibling agent's message read as something the human typed.
 */

/** Sender identity as it appears in a named header. */
export interface ProvenanceSender {
  id: string
  name: string
}

/** The invariant opening of a named header — the part interpolation cannot
 *  change, and therefore the part a matcher can rely on. */
export const NAMED_PROVENANCE_PREFIX = '[Message from Clave tab "'

/** Header used when the sending side has no tab identity. */
export const ANONYMOUS_PROVENANCE_HEADER = '[Message from a Clave agent]'

/** Build the provenance header for a delivery. The receiving agent must be
 *  able to tell the text came from a sibling tab, not from the user, and know
 *  how to answer it — hence the reply instruction carrying the sender's id. */
export function buildProvenanceHeader(sender: ProvenanceSender | undefined): string {
  if (!sender) return ANONYMOUS_PROVENANCE_HEADER
  return `${NAMED_PROVENANCE_PREFIX}${sender.name}" — reply with clave_send_to_session sessionId="${sender.id}"]`
}

/** The invariant opening of a checkpoint header — a self-addressed send,
 *  logged into the transport record, never delivered anywhere. */
export const CHECKPOINT_PROVENANCE_PREFIX = '[Checkpoint by Clave tab "'

/** Header used when the checkpointing side has no tab identity. */
export const ANONYMOUS_CHECKPOINT_HEADER = '[Checkpoint by a Clave agent — logged, not delivered]'

/**
 * Build the provenance stamped on a CHECKPOINT: a self-addressed send that is
 * logged, never delivered (the solo lane's internal note). Deliberately NOT
 * matched by `hasProvenanceHeader`: a checkpoint never appears in any
 * transcript, and the matcher's delivered-message semantics must stay exact.
 */
export function buildCheckpointProvenance(sender: ProvenanceSender | undefined): string {
  if (!sender) return ANONYMOUS_CHECKPOINT_HEADER
  return `${CHECKPOINT_PROVENANCE_PREFIX}${sender.name}" — logged, not delivered]`
}

/**
 * True when `text` arrived through clave_send_to_session — i.e. it is a
 * sibling agent's message that the transcript happens to store on the user
 * side, not something the human wrote.
 */
export function hasProvenanceHeader(text: string): boolean {
  const trimmed = text.trimStart()
  return (
    trimmed.startsWith(NAMED_PROVENANCE_PREFIX) || trimmed.startsWith(ANONYMOUS_PROVENANCE_HEADER)
  )
}
