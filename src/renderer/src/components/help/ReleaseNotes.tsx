import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReleaseNote } from '../../store/updater-store'

const remarkPlugins = [remarkGfm]

/**
 * A GitHub release body, rendered at sidebar scale.
 *
 * Not `MarkdownRenderer`: its `compact` variant is a panel surface — `p-5`,
 * `text-sm`, headings up to 20px with rules under them. Dropped into an 11px
 * announcement card it renders a document inside a banner. The bodies here are
 * a narrow, known shape (`### Added` / `### Fixed` headings over bullet lists,
 * with bold lead-ins), so this maps that shape and nothing else.
 *
 * Every element is capped at the card's own type scale, and headings are
 * rendered as small uppercase labels rather than as headings, because at this
 * size a heading and its body cannot differ by weight alone.
 */
const components = {
  // ### Added / ### Fixed — section labels, not headings, at this size.
  h1: ({ children }) => <ReleaseHeading>{children}</ReleaseHeading>,
  h2: ({ children }) => <ReleaseHeading>{children}</ReleaseHeading>,
  h3: ({ children }) => <ReleaseHeading>{children}</ReleaseHeading>,
  h4: ({ children }) => <ReleaseHeading>{children}</ReleaseHeading>,
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-1.5 last:mb-0 pl-3.5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-1.5 last:mb-0 pl-3.5 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="text-text-secondary">{children}</li>,
  // The lead-in of a release bullet ("**Codex usage panel** — ..."). It is the
  // scannable half of the line, so it takes the primary text colour.
  strong: ({ children }) => <strong className="font-medium text-text-primary">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  del: ({ children }) => <del className="text-text-tertiary">{children}</del>,
  code: ({ children }) => (
    <code className="bg-surface-200/60 text-text-primary px-1 py-px rounded text-[0.9em] font-mono">
      {children}
    </code>
  ),
  // A fenced block inside a release note is rare and would blow the card's
  // width open; render it scrolling rather than wrapping.
  pre: ({ children }) => (
    <pre className="mb-1.5 last:mb-0 p-1.5 rounded-md bg-surface-200/50 overflow-x-auto">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/40 pl-2 my-1.5 text-text-tertiary">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-border-subtle" />,
  // Links open in the browser, never in the app: a release note points at
  // GitHub, and an Electron renderer must not navigate itself away.
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline"
    >
      {children}
    </a>
  ),
  // Images are stripped. A release body may embed a screenshot; in a 240px
  // sidebar card it is noise, and it would be a network fetch besides.
  img: () => null
} as import('react-markdown').Components

function ReleaseHeading({ children }: { children?: React.ReactNode }): React.ReactElement {
  return (
    <p className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary mt-2 first:mt-0 mb-1">
      {children}
    </p>
  )
}

/**
 * Every release between the version running and the one on offer, newest first.
 *
 * The version heading appears only when there is more than one — with a single
 * release it repeats the version already on the card's own line, and a heading
 * that restates its container is noise.
 */
export const ReleaseNotes = memo(function ReleaseNotes({
  notes
}: {
  notes: ReleaseNote[]
}): React.ReactElement {
  const multiple = notes.length > 1
  const rendered = useMemo(
    () =>
      notes.map((n) => (
        <div key={n.version} className="mb-2 last:mb-0">
          {multiple && (
            <p className="text-[11px] font-medium text-text-primary mb-1">v{n.version}</p>
          )}
          <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
            {n.note}
          </ReactMarkdown>
        </div>
      )),
    [notes, multiple]
  )

  return <div>{rendered}</div>
})
