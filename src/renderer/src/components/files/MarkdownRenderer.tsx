import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSyntaxHighlight } from '../../hooks/use-syntax-highlight'
import { handleClaveLink } from '../../lib/navigation'

const CodeBlock = memo(function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const filename = lang ? `file.${lang}` : 'file.txt'
  const { html } = useSyntaxHighlight(code, filename)

  if (!html) {
    return (
      <pre className="rounded-lg bg-surface-200/50 p-3 overflow-x-auto">
        <code className="text-xs font-mono">{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="rounded-lg bg-surface-200/50 p-3 overflow-x-auto [&_pre]:!bg-transparent [&_code]:!bg-transparent text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

const remarkPlugins = [remarkGfm]

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  const components = useMemo(
    () => ({
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-text-primary mt-6 mb-3 first:mt-0 pb-2 border-b border-border-subtle">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-text-primary mt-5 mb-2 first:mt-0 pb-1.5 border-b border-border-subtle">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-text-primary mt-4 mb-2 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-text-primary mt-3 mb-1.5 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-accent hover:underline cursor-pointer"
              onClick={(e) => {
                if (href && handleClaveLink(href)) {
                  e.preventDefault()
                }
              }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="mb-3 pl-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 pl-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-text-primary">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-accent/40 pl-4 my-3 text-text-secondary italic">
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || '')
            const code = String(children).replace(/\n$/, '')

            if (match || code.includes('\n')) {
              return <CodeBlock lang={match?.[1] ?? ''} code={code} />
            }

            return (
              <code className="bg-surface-200/60 text-text-primary px-1.5 py-0.5 rounded text-[0.85em] font-mono">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="text-left px-3 py-1.5 font-semibold text-text-secondary">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-b border-border-subtle">{children}</td>
          ),
          hr: () => <hr className="my-4 border-border-subtle" />,
          img: ({ src, alt }) => (
            <img src={src} alt={alt ?? ''} className="max-w-full rounded my-3" />
          ),
          input: ({ checked, ...props }) => (
            <input
              {...props}
              checked={checked}
              disabled
              className="mr-1.5 accent-accent"
              type="checkbox"
            />
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          del: ({ children }) => <del className="text-text-tertiary">{children}</del>
        }) as import('react-markdown').Components,
    []
  )

  return (
    <div className="p-5 prose-preview text-sm leading-relaxed text-text-primary">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        children={content}
        components={components}
      />
    </div>
  )
})
