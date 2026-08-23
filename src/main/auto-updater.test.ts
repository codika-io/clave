import { describe, it, expect } from 'vitest'
import { downloadStrategy } from './auto-updater'

/**
 * The one rule worth pinning: a retry must not be the same request that just
 * failed. It used to be — `handleRetry` called `startDownload()`, which called
 * `autoUpdater.downloadUpdate()`, with nothing in between changing state or
 * strategy. A deterministic failure was therefore unescapable, and because
 * auto-update is Clave's whole distribution channel, a user who hit one stayed
 * on their version indefinitely without knowing.
 *
 * Only `downloadStrategy` is exercised here. `startDownload` reaches into the
 * electron-updater singleton and `initAutoUpdater` early-returns unless the app
 * is packaged, so neither can be decided without a window — that belongs to the
 * end-to-end specs, per this suite's pure-logic rule.
 */
describe('downloadStrategy', () => {
  it('lets the first attempt take the fast differential path', () => {
    expect(downloadStrategy('first')).toEqual({ disableDifferentialDownload: false })
  })

  it('drops differential on a retry, so the request differs from the one that failed', () => {
    expect(downloadStrategy('retry')).toEqual({ disableDifferentialDownload: true })
  })

  it('never returns the same strategy for both attempts', () => {
    // The regression guard proper: whatever the strategy grows into, a retry
    // that resolves to the first attempt's plan is the bug this fixed.
    expect(downloadStrategy('retry')).not.toEqual(downloadStrategy('first'))
  })
})
