import { registerLinkedFlusher } from '../../store/linked-document-store'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PaperClipIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { LinkedDocument, LinkedEmail, LinkedUpdate } from '../../../../shared/linked-documents'
import { MarkdownPageEditor } from './MarkdownPageEditor'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { CodeEditor } from './CodeEditor'

/** Sandboxed rich HTML editing keeps imported email layout/styles outside app chrome. */
function EmailBody({
  html,
  onChange
}: {
  html: string
  onChange: (html: string) => void
}): React.JSX.Element {
  const ref = useRef<HTMLIFrameElement>(null)
  const callback = useRef(onChange)
  useLayoutEffect(() => {
    callback.current = onChange
  }, [onChange])
  const [initial] = useState(html)
  useEffect(() => {
    const body = ref.current?.contentDocument?.body
    if (body && body.innerHTML !== html && ref.current?.contentDocument?.activeElement !== body)
      body.innerHTML = html
  }, [html])
  return (
    <iframe
      ref={ref}
      title="Email body"
      className="linked-email-body"
      sandbox="allow-same-origin"
      srcDoc={
        '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><style>body{font:14px system-ui;line-height:1.6;margin:16px;outline:none;overflow-wrap:anywhere}img{max-width:100%}</style></head><body>' +
        initial +
        '</body></html>'
      }
      onLoad={() => {
        const body = ref.current?.contentDocument?.body
        if (!body) return
        body.setAttribute('contenteditable', 'true')
        body.setAttribute('aria-label', 'Email body')
        body.addEventListener('input', () => callback.current(body.innerHTML))
        body.addEventListener('click', (event) => {
          if ((event.target as Element).closest('a')) event.preventDefault()
        })
      }}
    />
  )
}

export function LinkedDocumentPanel({
  document: incoming
}: {
  document: LinkedDocument
}): React.JSX.Element {
  const [doc, setDoc] = useState(incoming)
  const current = useRef(incoming)
  const [status, setStatus] = useState('Saved')
  const [error, setError] = useState('')
  const [source, setSource] = useState(incoming.kind === 'html')
  const [epoch, setEpoch] = useState(0)
  const pending = useRef(0)
  const queue = useRef(Promise.resolve())
  const scroll = useRef<HTMLDivElement>(null)
  const blocked = useRef(false)
  useEffect(
    () =>
      registerLinkedFlusher(
        incoming.sessionId,
        async (allowConflict) => {
          let last: Promise<void>
          do {
            last = queue.current
            await last
          } while (last !== queue.current)
          if (blocked.current || (!allowConflict && current.current.conflict))
            throw new Error(
              'Editor has unsaved/conflicting edits. Resolve them before handing off.'
            )
        },
        () => blocked.current
      ),
    [incoming.sessionId]
  )
  useEffect(() => {
    const close = (event: BeforeUnloadEvent): void => {
      if (pending.current || blocked.current) {
        event.preventDefault()
        event.returnValue = false
      }
    }
    window.addEventListener('beforeunload', close)
    return () => window.removeEventListener('beforeunload', close)
  }, [])
  useEffect(() => {
    if (pending.current || blocked.current || incoming.revision < current.current.revision) return
    if (incoming.revision !== current.current.revision) setEpoch((e) => e + 1)
    current.current = incoming
    setDoc(incoming)
  }, [incoming])
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = incoming.scroll
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function update(input: LinkedUpdate): void {
    if (blocked.current) return
    pending.current++
    setStatus('Saving…')
    setError('')
    // Keep the visible buffer local while serializing every edit through the main revision boundary.
    if (input.content !== undefined) setDoc((d) => ({ ...d, content: input.content! }))
    if (input.email) setDoc((d) => ({ ...d, email: input.email }))
    queue.current = queue.current.then(async () => {
      if (blocked.current) {
        pending.current--
        return
      }
      try {
        const saved = await window.electronAPI.linkedDocuments.update(
          current.current.id,
          current.current.revision,
          input
        )
        current.current = saved
        if (pending.current === 1) setDoc(saved)
        if (input.reloadExternal) setEpoch((e) => e + 1)
        setStatus(saved.conflict ? 'Conflict · edits retained' : 'Saved')
      } catch (e) {
        // Never overwrite the local buffer following an agent revision conflict.
        blocked.current = true
        setError(String(e))
        setStatus('Not saved · copy your edits before reloading')
      } finally {
        pending.current--
      }
    })
  }
  function changeEmail(field: keyof LinkedEmail, value: string): void {
    update({ email: { ...doc.email!, [field]: value } })
  }
  async function choose(signature = false): Promise<void> {
    try {
      const files = await window.electronAPI.linkedDocuments.chooseFiles(signature)
      if (files.length) update(signature ? { signaturePath: files[0] } : { addAttachments: files })
    } catch (e) {
      setError(String(e))
    }
  }
  const delivery = doc.delivery
  return (
    <section
      className="linked-document-panel floating-card"
      data-testid="linked-document-panel"
      data-document-id={doc.id}
    >
      <header className="linked-document-header">
        <span className="truncate flex-1 text-sm">{doc.title}</span>
        <span role="status" className="text-xs text-text-tertiary">
          {status}
        </span>
        {doc.kind !== 'email' && (
          <button className="panel-tab" onClick={() => setSource((v) => !v)}>
            {source ? 'Rendered' : 'Source'}
          </button>
        )}
        <button
          className="panel-icon-btn"
          title="Hide linked document"
          aria-label="Hide linked document"
          onClick={() => update({ hidden: true })}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </header>
      {(error || doc.conflict) && (
        <div className="linked-document-notice" role="alert">
          {error || doc.conflict}
          <button
            className="panel-tab"
            onClick={() => {
              void navigator.clipboard.writeText(doc.email ? doc.email.bodyHtml : doc.content)
            }}
          >
            Copy my edits
          </button>
          <button
            className="panel-tab"
            onClick={async () => {
              if (pending.current) return
              if (doc.conflict) update({ reloadExternal: true })
              else {
                const latest = (await window.electronAPI.linkedDocuments.list()).find(
                  (d) => d.id === doc.id
                )
                if (latest) {
                  blocked.current = false
                  current.current = latest
                  setDoc(latest)
                  setEpoch((e) => e + 1)
                  setError('')
                  setStatus('Saved')
                }
              }
            }}
          >
            Load saved version
          </button>
        </div>
      )}
      <div
        ref={scroll}
        className="linked-document-content"
        onScroll={() => {
          const top = scroll.current?.scrollTop ?? 0
          if (!pending.current && !blocked.current) update({ scroll: top })
        }}
      >
        {doc.email ? (
          <div className="linked-email-composer">
            {(['from', 'to', 'cc', 'bcc', 'subject'] as const).map((field) => (
              <label key={field} className="linked-email-field">
                <span>
                  {{ from: 'From', to: 'To', cc: 'Cc', bcc: 'Bcc', subject: 'Subject' }[field]}
                </span>
                <input
                  className="input-field"
                  aria-label={
                    field === 'subject'
                      ? 'Subject'
                      : field === 'from'
                        ? 'From'
                        : field === 'to'
                          ? 'To'
                          : field === 'cc'
                            ? 'Cc'
                            : 'Bcc'
                  }
                  value={doc.email![field]}
                  onChange={(e) => changeEmail(field, e.target.value)}
                />
              </label>
            ))}
            <EmailBody
              key={epoch}
              html={doc.email.bodyHtml}
              onChange={(html) => changeEmail('bodyHtml', html)}
            />
            <div className="linked-document-header">
              <span className="flex-1 text-xs text-text-secondary">Signature</span>
              <button className="panel-tab" onClick={() => void choose(true)}>
                Import HTML
              </button>
              {doc.email.signatureHtml && (
                <button
                  className="panel-tab"
                  onClick={() =>
                    update({ email: { ...doc.email!, signatureHtml: '', signatureText: '' } })
                  }
                >
                  Remove
                </button>
              )}
            </div>
            {doc.email.signatureHtml ? (
              <iframe
                title="Signature preview"
                className="linked-signature-preview"
                sandbox=""
                srcDoc={
                  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' +
                  doc.email.signatureHtml
                }
              />
            ) : (
              <p className="text-xs text-text-tertiary px-2">No signature selected</p>
            )}
            <div className="linked-document-header">
              <span className="flex-1 text-xs text-text-secondary">Attachments</span>
              <button className="panel-tab" onClick={() => void choose()}>
                <PaperClipIcon className="w-4 h-4" />
                Add files
              </button>
            </div>
            {doc.attachments.map((a) => (
              <div className="linked-document-header" key={a.id}>
                <button
                  className="panel-tab truncate"
                  onClick={() => {
                    void window.electronAPI.linkedDocuments
                      .openAttachment(doc.id, a.id)
                      .catch((e) => setError(String(e)))
                  }}
                >
                  {a.name}
                </button>
                <span className="flex-1 text-xs text-text-tertiary">
                  {Math.ceil(a.size / 1024)} KB
                </span>
                <button
                  className="panel-icon-btn"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => update({ removeAttachments: [a.id] })}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="linked-document-notice">
              {delivery
                ? `${delivery.status === 'sent' ? 'Sent' : delivery.status === 'failed' ? 'Sending failed' : 'Delivery uncertain'} · revision ${delivery.revision}${delivery.revision !== doc.revision ? ' · current edits are unsent' : ''}${delivery.detail ? '. ' + delivery.detail : ''}`
                : 'When ready, ask your agent to send this email.'}
            </div>
          </div>
        ) : source ? (
          <CodeEditor
            filename={doc.path!}
            value={doc.content}
            onChange={(content) => update({ content })}
          />
        ) : doc.kind === 'markdown' ? (
          <MarkdownPageEditor
            key={epoch}
            content={doc.content}
            onChange={(content) => update({ content })}
            onSave={() => {}}
          />
        ) : doc.conflict ? (
          <div className="linked-document-notice">
            Resolve the external file conflict before previewing. Your edits remain available in
            Source.
          </div>
        ) : (
          <HtmlPreviewFrame filePath={doc.path!} reloadKey={doc.revision} />
        )}
      </div>
    </section>
  )
}
