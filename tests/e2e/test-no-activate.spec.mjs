/**
 * `--test-no-activate`: the app under automated test must not steal the focus.
 *
 * An E2E run launches a second Electron instance on the same desktop a human is
 * working on. Without this flag every `ready-to-show` yanked the keyboard away
 * mid-sentence and dropped a second Clave icon in the Dock. The flag makes the
 * instance a macOS accessory that shows its windows with `showInactive()`.
 * `harness.mjs` passes it on every launch, so this spec asserts the harness's
 * own default rather than a special launch of its own.
 *
 * The load-bearing claim is: the window is ON SCREEN and was never made key.
 * That pair is exactly the difference between `showInactive()` and `show()` —
 * measured: with `show()` under the accessory policy the window is key ~600ms
 * after launch, with `showInactive()` it is not.
 *
 * WHY the second window, and why the state is captured at the `show` EVENT
 * rather than polled later: OS focus is not ours alone. Any other app on the
 * machine quitting can hand activation to this accessory instance seconds after
 * boot — observed on this host, focus arriving at +4.2s of a run that showed
 * inactive correctly. Polling `isFocused()` late therefore measures the desktop,
 * not the code. Reading it inside the window's own `show` handler measures the
 * one instant the code decides, and a second window opened AFTER the recorder is
 * installed removes the launch race entirely.
 */
import {
  launchApp,
  seedWorkspaces,
  userDataDir,
  openWindow,
  windows as allWindows,
  until
} from './harness.mjs'
import { mkdirSync } from 'node:fs'

const DIR = userDataDir('no-activate')
const ROOT_A = '/tmp/clave-e2e-no-activate-a'
const ROOT_B = '/tmp/clave-e2e-no-activate-b'
const WS_A = {
  id: 'cccccccc-0000-4000-8000-00000000000c',
  name: 'NoActivateA',
  rootDir: ROOT_A,
  profileFile: null,
  createdAt: 1
}
const WS_B = {
  id: 'dddddddd-0000-4000-8000-00000000000d',
  name: 'NoActivateB',
  rootDir: ROOT_B,
  profileFile: null,
  createdAt: 2
}

export async function run(t) {
  mkdirSync(ROOT_A, { recursive: true })
  mkdirSync(ROOT_B, { recursive: true })
  seedWorkspaces(DIR, { workspaces: [WS_A, WS_B], activeWorkspaceId: WS_A.id, fresh: true })

  // settleMs: 0 — read the first window's state as early as the harness allows,
  // before the desktop has had seconds to hand this instance activation.
  const { app, win } = await launchApp(DIR, { settleMs: 0 })
  try {
    // ── it boots at all under the flag ──
    const argv = await app.evaluate(() => process.argv)
    t.check(
      'the main process received --test-no-activate',
      argv.includes('--test-no-activate'),
      argv
    )

    const first = await app.evaluate(({ app, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      return {
        windows: BrowserWindow.getAllWindows().length,
        visible: w ? w.isVisible() : null,
        focused: w ? w.isFocused() : null,
        dockVisible: process.platform === 'darwin' ? (app.dock?.isVisible() ?? null) : null
      }
    })
    t.equal('exactly one window opened', first.windows, 1)
    t.equal('the window IS on screen', first.visible, true)
    // A smoke read, not the proof: the first window shows before a recorder can
    // be installed, so this samples focus rather than catching the instant. The
    // mutation detector is the show-event capture below.
    t.equal('and it is not key at the first read', first.focused, false)
    t.equal('no Dock icon: the instance runs as an accessory', first.dockVisible, false)

    // ── the race-free measurement: was the window key AT its own show? ──
    await app.evaluate(({ app }) => {
      globalThis.__showStates = []
      globalThis.__readyStates = [] // diagnostic: how far window creation got
      app.on('browser-window-created', (_e, w) => {
        w.once('ready-to-show', () => globalThis.__readyStates.push({ id: w.id }))
        w.once('show', () =>
          globalThis.__showStates.push({ id: w.id, visible: w.isVisible(), focused: w.isFocused() })
        )
      })
    })
    const opened = await openWindow(app, win, WS_B.id, { settleMs: 1500 })
    t.equal('opening workspace B made a NEW window', opened.focusedExisting, false)
    // Bounded wait, never a fixed settle: under host load a new window can take
    // longer than any fixed delay to reach ready-to-show → showInactive(), and
    // reading the recorder early returns [] — that mechanism turned this block
    // red (3 assertions) on a host at load average ~11 while the same build ran
    // 4/4 green on a quiet one. Baseline: show fires well inside 1500ms solo.
    // Ceiling 30s (the contention-ledger convention); what is ASSERTED — the
    // state captured inside the show handler itself — is unchanged.
    const shown =
      (await until(
        async () => {
          const s = await app.evaluate(() => globalThis.__showStates)
          return s.length >= 1 ? s : null
        },
        { tries: 120, gapMs: 250 }
      )) ?? (await app.evaluate(() => globalThis.__showStates))
    const ready = await app.evaluate(() => globalThis.__readyStates)
    t.check('the new window reached its show handler', shown.length === 1, { shown, ready })
    t.equal('it was put on screen', shown[0]?.visible, true)
    t.equal('showInactive(), not show(): it was NOT key at that instant', shown[0]?.focused, false)
    t.equal('both windows are open', (await allWindows(app)).length, 2)

    // ── the driver can still work the app without OS focus ──
    // Focus is an OS concept; Playwright drives the renderer over CDP and does
    // not need it. If that were false the whole suite would be unrunnable under
    // the flag, so prove one real interaction end to end.
    await win.click('.launcher-caret')
    await win.waitForTimeout(800)
    const menuItems = await win.evaluate(
      () => document.querySelectorAll('[role="menuitem"]').length
    )
    t.check('clicking the launcher caret opens the agent menu', menuItems > 0, menuItems)
    await win.keyboard.press('Escape')
    await win.waitForTimeout(400)
    t.check(
      'and Escape closes it — keyboard input lands too',
      await win.evaluate(() => document.querySelectorAll('[role="menuitem"]').length === 0)
    )
  } finally {
    await app.close()
  }
}
