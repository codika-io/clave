import type { WebviewTag } from 'electron'

/**
 * The `<webview>` tag as a JSX element. Electron types the element itself
 * (`WebviewTag`: goBack, canGoForward, loadURL, getURL, …) but React knows no
 * such intrinsic; this is the one declaration that lets WebViewPane render it.
 */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewTag>, WebviewTag> & {
        src?: string
        partition?: string
        allowpopups?: string
      }
    }
  }
}
