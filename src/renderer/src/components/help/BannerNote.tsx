import type { ReactNode } from 'react'
import { useBannerNote } from './use-banner-note'

/**
 * The whole disclosure as one element, for a card whose trigger shares its row
 * with nothing. `useBannerNote` is the form to reach for when it does.
 */
export function BannerNote({
  children,
  label,
  defaultOpen = false
}: {
  children: ReactNode
  /** What the chevron opens, for screen readers: "what's new in 1.80.0". */
  label: string
  defaultOpen?: boolean
}): ReactNode {
  const { trigger, note } = useBannerNote(children, label, defaultOpen)
  return (
    <>
      {trigger}
      {note}
    </>
  )
}
