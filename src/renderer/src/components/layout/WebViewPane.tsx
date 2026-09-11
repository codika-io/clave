import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  GlobeAltIcon,
  HomeIcon
} from '@heroicons/react/24/outline'
import type { WebviewTag } from 'electron'
import { HtmlPreviewFrame } from '../files/HtmlPreviewFrame'
import { isAtHome } from '../../../../shared/view-navigation'

const PROBE_TIMEOUT_MS = 500
const PROBE_INTERVAL_MS = 10_000
const STARTING_PROBE_INTERVAL_MS = 2_000
const STARTING_TIMEOUT_MS = 60_000

type ProbeState = 'unknown' | 'up' | 'down' | 'starting'

/** Where the guest page is, read off the web view after every navigation. */
interface Trail {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
}

export interface WebViewPaneProps {
  /** http(s) URL (probed) or an absolute .html path (rendered, no probe). */
  url: string
  title: string
  /** Label of the segmented button that leaves the view ("Sessions", "Terminal"). */
  backLabel: string
  onBack: () => void
  /** The start action shown when the probe says down; null = no way to start. */
  start: { label: string; run: () => Promise<void> } | null
  /** False while the pane is mounted but hidden behind whatever the user is
   *  actually looking at. The frame stays alive (that is the whole point of
   *  keeping it mounted), but a pane nobody can see stops polling its server. */
  active?: boolean
}

/**
 * The rendered page a view carries — fills the main pane in place of what the
 * sidebar item normally shows (a group's session mosaic, a session's terminal).
 * An http(s) url (a dev server, a workstream dashboard) embeds live as an
 * Electron web view; an absolute .html path renders through the clave-preview
 * protocol. For servers, an HTTP probe keeps the pane honest: a dead server
 * shows a start action wired to whatever serves it, not a broken frame.
 *
 * The declared url is the view's HOME, and the page is free to link away from
 * it: an exos wave page links its lanes, a board links its cycles. The web view
 * keeps that trail as a history of its own, so the header carries what a page
 * that links needs — back, forward, home — and names the page the reader is
 * actually on rather than the one the sidebar declared. Which links stay in
 * the pane and which leave for the browser is the main process's rule
 * (view-guests.ts); the trail is the reader's and is never persisted.
 * Extracted from the group view panel so session views share one
 * probe/header/frame implementation.
 */
export function WebViewPane({
  url,
  title,
  backLabel,
  onBack,
  start,
  active = true
}: WebViewPaneProps): React.JSX.Element {
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
  // starting window polls faster so a booting server appears promptly. A hidden
  // pane polls nothing and picks it up again on the probe this effect runs when
  // it comes back — the frame it is holding open costs nothing to leave alone.
  useEffect(() => {
    if (isFile || !active) return
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
  }, [isFile, active, probeNow])

  const showFrame = isFile || probe === 'up'

  // The trail: where the guest is, refreshed on every navigation event the web
  // view emits. The tag's methods throw until the guest is attached, and the
  // pane renders before that, so every read is guarded — an unattached guest
  // simply reads as "at home, nowhere to go".
  const webviewRef = useRef<WebviewTag | null>(null)
  const [trail, setTrail] = useState<Trail>({
    url,
    title: '',
    canGoBack: false,
    canGoForward: false
  })
  useEffect(() => {
    const wv = webviewRef.current
    if (isFile || !showFrame || !wv) return
    const sync = (): void => {
      try {
        setTrail({
          url: wv.getURL() || url,
          title: wv.getTitle(),
          canGoBack: wv.canGoBack(),
          canGoForward: wv.canGoForward()
        })
      } catch {
        // not attached yet — the next event will land
      }
    }
    const events = [
      'dom-ready',
      'did-navigate',
      'did-navigate-in-page',
      'did-finish-load',
      'page-title-updated'
    ]
    for (const e of events) wv.addEventListener(e, sync)
    return () => {
      for (const e of events) wv.removeEventListener(e, sync)
    }
    // `nonce` remounts the tag; the new element needs its listeners again.
  }, [isFile, showFrame, nonce, url])

  const guest = useCallback((fn: (wv: WebviewTag) => void): void => {
    const wv = webviewRef.current
    if (!wv) return
    try {
      fn(wv)
    } catch {
      // not attached — nothing to drive
    }
  }, [])

  const atHome = isFile || isAtHome(url, trail.url)
  const handleBack = useCallback(() => guest((wv) => wv.goBack()), [guest])
  const handleForward = useCallback(() => guest((wv) => wv.goForward()), [guest])
  const handleHome = useCallback(() => guest((wv) => void wv.loadURL(url)), [guest, url])

  const handleStart = useCallback(() => {
    if (!start) return
    startingSinceRef.current = Date.now()
    setProbe('starting')
    start.run().catch(() => {
      startingSinceRef.current = null
      setProbe('down')
    })
  }, [start])

  // Reload reloads the page the reader is ON — the trail survives. A file view
  // and a frame the probe has not brought up yet remount instead.
  const handleRefresh = useCallback(() => {
    if (!isFile && showFrame && webviewRef.current) {
      guest((wv) => wv.reload())
      void probeNow()
      return
    }
    setNonce((n) => n + 1)
    if (!isFile) void probeNow()
  }, [isFile, showFrame, guest, probeNow])

  const handleOpenExternal = useCallback(() => {
    if (isFile) window.electronAPI.openPath(url)
    else window.electronAPI.openExternal(trail.url || url)
  }, [isFile, url, trail.url])

  // The header names the page the reader is on: the declared title at home,
  // the guest's own title once the reader has followed a link.
  const shownTitle = atHome || !trail.title ? title : trail.title
  const shownUrl = isFile ? url.replace(/^\/Users\/[^/]+/, '~') : trail.url || url

  return (
    <div className="h-full flex flex-col floating-card overflow-hidden">
      {/* Header — the trail, title, source, and the way back to what the item normally shows */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle flex-shrink-0 bg-surface-0">
        {!isFile && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleBack}
              disabled={!trail.canGoBack}
              className="btn-icon"
              title="Back"
              data-testid="view-nav-back"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleForward}
              disabled={!trail.canGoForward}
              className="btn-icon"
              title="Forward"
              data-testid="view-nav-forward"
            >
              <ArrowRightIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleHome}
              disabled={atHome}
              className="btn-icon"
              title="Home"
              data-testid="view-nav-home"
            >
              <HomeIcon className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GlobeAltIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          <span
            className="text-sm font-medium text-text-primary truncate flex-shrink-0 max-w-[40%]"
            data-testid="view-title"
          >
            {shownTitle}
          </span>
          <span
            className="text-[11px] text-text-tertiary truncate hidden sm:inline flex-1 min-w-0"
            data-testid="view-current-url"
          >
            {shownUrl}
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
          // A guest with its own history. It is hardened in the main process
          // (no preload, no node, sandboxed) and its links are policed there;
          // no `allowpopups`, so window.open goes to the system browser.
          <webview
            key={nonce}
            ref={webviewRef}
            src={url}
            // eslint-disable-next-line react/no-unknown-property -- Electron's own attribute
            partition="persist:view"
            className="w-full h-full bg-white"
            style={{ display: 'flex' }}
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
