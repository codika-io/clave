import { describe, it, expect } from 'vitest'
import {
  downloadStrategy,
  phaseOnAvailable,
  phaseOnCheckError,
  phaseOnCheckStart,
  phaseOnNotAvailable,
  type UpdatePhase
} from './auto-updater'

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

/**
 * The transitions. Each case here is a way the updater UI used to lie: a
 * background check every 30 minutes runs underneath whatever the user is
 * doing, so a handler that just assigns a phase will stomp a download in
 * flight, and a check that could not reach GitHub will either say nothing at
 * all or raise a full-screen "Update failed" over an app that is fine.
 */
describe('phase transitions', () => {
  it('enters checking only from rest', () => {
    expect(phaseOnCheckStart('idle')).toBe('checking')
    expect(phaseOnCheckStart('available')).toBe('checking')
  })

  it('never repaints work in flight as checking', () => {
    expect(phaseOnCheckStart('downloading')).toBe('downloading')
    expect(phaseOnCheckStart('downloaded')).toBe('downloaded')
    expect(phaseOnCheckStart('error')).toBe('error')
  })

  it('surfaces an available update from rest', () => {
    expect(phaseOnAvailable('idle', false)).toBe('available')
    expect(phaseOnAvailable('checking', false)).toBe('available')
  })

  it('does not demote a download in flight when the timer re-finds the update', () => {
    // The 30-minute check re-emits update-available for the version already
    // downloading. Assigning 'available' here would replace the progress
    // overlay with a Download button mid-transfer.
    expect(phaseOnAvailable('downloading', true)).toBe('downloading')
    expect(phaseOnAvailable('downloaded', false)).toBe('downloaded')
    expect(phaseOnAvailable('error', false)).toBe('error')
  })

  it('returns to rest when the server has nothing, without touching a download', () => {
    expect(phaseOnNotAvailable('checking')).toBe('idle')
    expect(phaseOnNotAvailable('available')).toBe('idle')
    expect(phaseOnNotAvailable('downloading')).toBe('downloading')
    expect(phaseOnNotAvailable('downloaded')).toBe('downloaded')
  })

  it('never turns a failed check into a failed update', () => {
    // `error` is the full-screen overlay. A check that could not reach GitHub
    // must land in checkErrorMessage and stay out of this phase entirely.
    const every: UpdatePhase[] = ['idle', 'checking', 'available', 'downloading', 'downloaded']
    for (const phase of every) {
      expect(phaseOnCheckError(phase)).not.toBe('error')
    }
    expect(phaseOnCheckError('checking')).toBe('idle')
    expect(phaseOnCheckError('downloading')).toBe('downloading')
  })
})
