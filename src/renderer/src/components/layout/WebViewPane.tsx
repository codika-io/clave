import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { HtmlPreviewFrame } from '../files/HtmlPreviewFrame'

const PROBE_TIMEOUT_MS = 500
const PROBE_INTERVAL_MS = 10_000
const STARTING_PROBE_INTERVAL_MS = 2_000
const STARTING_TIMEOUT_MS = 60_000

type ProbeState = 'unknown' | 'up' | 'down' | 'starting'

export interface WebViewPaneProps {
  /** http(s) URL (probed) or an absolute .html path (rendered, no probe). */
  url: string
  title: string
  /** Label of the segmented button that leaves the view ("Sessions", "Terminal"). */
  backLabel: string
  onBack: () => void
  /** The start action shown when the probe says down; null = no way to start. */
  start: { label: string; run: () => Promise<void> } | null
}

/**
 * The rendered page a view carries — fills the main pane in place of what the
 * sidebar item normally shows (a group's session mosaic, a session's terminal).
 * An http(s) url (a dev server, a workstream dashboard) embeds live; an
 * absolute .html path renders through the clave-preview protocol. For servers,
 * an HTTP probe keeps the pane honest: a dead server shows a start action
 * wired to whatever serves it, not a broken frame. Extracted from the group
 * view panel so session views share one probe/header/frame implementation.
 */
export function WebViewPane({ url, title, backLabel, onBack, start }: WebViewPaneProps): React.JSX.Element {
  const isFile = url.startsWith('/')
  const [probe, setProbe] = useState<ProbeState>(isFile ? 'up' : 'unknown')
  const [nonce, setNonce] = useState(0)
  const probeRef = useRef(probe)
  useEffect(() => {
    probeRef.current = probe
  }, [probe])
  const startingSinceRef = useRef<number | null>(null)

  const probeNow = useCallback(async () => {
    if (isFile || !url) return
    const ok = await window.electronAPI.probeServerUrl(url, PROBE_TIMEOUT_MS)
    if (probeRef.current === 'starting') {
      if (ok) {
        startingSinceRef.current = null
        setProbe('up')
        setNonce((n) => n + 1)
      } else if (
        startingSinceRef.current !== null &&
        Date.now() - startingSinceRef.current > STARTING_TIMEOUT_MS
      ) {
        startingSinceRef.current = null
        setProbe('down')
      }
      return
    }
    setProbe((prev) => {
      if (ok && prev !== 'up') setNonce((n) => n + 1)
      return ok ? 'up' : 'down'
    })
  }, [isFile, url])

  // Probe on mount and keep the dot honest while the app is focused; the
  // starting window polls faster so a booting server appears promptly.
  useEffect(() => {
    if (isFile) return
    const initialProbe = setTimeout(() => void probeNow(), 0)
    const interval = setInterval(() => {
      if (probeRef.current !== 'starting' && !document.hasFocus()) return
      void probeNow()
    }, PROBE_INTERVAL_MS)
    const fastInterval = setInterval(() => {
      if (probeRef.current === 'starting') void probeNow()
    }, STARTING_PROBE_INTERVAL_MS)
    const onFocus = (): void => void probeNow()
    window.addEventListener('focus', onFocus)
    return () => {
      clearTimeout(initialProbe)
      clearInterval(interval)
      clearInterval(fastInterval)
      window.removeEventListener('focus', onFocus)
    }
  }, [isFile, probeNow])

  const handleStart = useCallback(() => {
    if (!start) return
    startingSinceRef.current = Date.now()
    setProbe('starting')
    start.run().catch(() => {
      startingSinceRef.current = null
      setProbe('down')
    })
  }, [start])

  const handleRefresh = useCallback(() => {
    setNonce((n) => n + 1)
    if (!isFile) void probeNow()
  }, [isFile, probeNow])

  const handleOpenExternal = useCallback(() => {
    if (isFile) window.electronAPI.openPath(url)
    else window.electronAPI.openExternal(url)
  }, [isFile, url])

  const showFrame = isFile || probe === 'up'

  return (
    <div className="h-full flex flex-col floating-card overflow-hidden">
      {/* Header — title, source, and the way back to what the item normally shows */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle flex-shrink-0 bg-surface-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GlobeAltIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          <span className="text-sm font-medium text-text-primary truncate flex-shrink-0 max-w-[40%]">
            {title}
          </span>
          <span className="text-[11px] text-text-tertiary truncate hidden sm:inline flex-1 min-w-0">
            {isFile ? url.replace(/^\/Users\/[^/]+/, '~') : url}
          </span>
          {!isFile && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor:
                  probe === 'up' ? '#4cb782' : probe === 'starting' ? '#e8b931' : '#d45461'
              }}
              title={
                probe === 'up' ? 'Server up' : probe === 'starting' ? 'Starting…' : 'Server down'
              }
            />
          )}
        </div>
        <div className="segmented flex-shrink-0">
          <button className="segmented-item" data-active={true}>
            View
          </button>
          <button className="segmented-item" onClick={onBack}>
            {backLabel}
          </button>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={handleRefresh} className="btn-icon" title="Reload">
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenExternal}
            className="btn-icon"
            title={isFile ? 'Open externally' : 'Open in browser'}
          >
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {isFile ? (
          <HtmlPreviewFrame filePath={url} reloadKey={nonce} />
        ) : showFrame ? (
          <iframe
            key={nonce}
            src={url}
            // Dev servers need scripts + their own origin (XHR, websockets for
            // live reload); the frame stays cross-origin from the app, and
            // window.open goes to the system browser via main's open handler.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            className="w-full h-full border-0 bg-white"
            title={title}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-sm px-6">
              <div className="text-sm text-text-secondary mb-1">
                {probe === 'starting' ? 'Starting server…' : 'Server not responding'}
              </div>
              <div className="text-xs text-text-tertiary mb-4 truncate">{url}</div>
              {probe !== 'starting' && (
                <div className="flex items-center justify-center gap-2">
                  {start && (
                    <button onClick={handleStart} className="btn-primary">
                      {start.label}
                    </button>
                  )}
                  <button onClick={() => void probeNow()} className="btn-secondary">
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
