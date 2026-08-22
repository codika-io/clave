// Shared harness for the Electron end-to-end checks.
//
// These drive the REAL app — real main process, real `window.electronAPI`, real
// PTYs — against an isolated `--user-data-dir`, so they never touch the user's
// installed Clave. The regular `playwright` MCP opens the renderer in Chrome
// where `window.electronAPI` is undefined and none of this works.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ELECTRON_BIN = path.join(
  REPO,
  'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
)

/** A user-data dir of this spec's own, so specs never collide. */
export function userDataDir(name) {
  return `/tmp/clave-e2e-${name}`
}

/** Seed the workspace registry the app boots from. Without this the app starts
 *  in no-workspace mode, where "launch at the workspace root" has no root and
 *  correctly falls back to the folder picker. */
export function seedWorkspaces(dir, { workspaces, activeWorkspaceId, fresh = false }) {
  if (fresh) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'workspace-state.json'),
    JSON.stringify(
      { version: 1, workspaces, activeWorkspaceId, pins: [], pinsMigrated: true },
      null,
      2
    )
  )
}

/** Mark roots as trusted so the elevated-content review dialog does not appear.
 *  Pass nothing to leave every root UNTRUSTED — which is what the trust-gate
 *  spec needs. */
export function seedTrustedRoots(dir, roots) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'clave-trusted-roots.json'), JSON.stringify(roots))
}

/** Launch the built app. Run `npx electron-vite build` first — these read `out/`. */
export async function launchApp(dir, { settleMs = 4000 } = {}) {
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: ['.', `--user-data-dir=${dir}`],
    cwd: REPO
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(settleMs)
  return { app, win }
}

/** Replace the native folder picker in the MAIN process so a spec can tell
 *  "opened the picker" from "went straight to the workspace root" — a native
 *  modal would otherwise block the run forever. Returns a reader for the count. */
export async function stubFolderDialog(app, { returns = null } = {}) {
  await app.evaluate(async ({ dialog }, folder) => {
    globalThis.__e2eDialogCalls = 0
    dialog.showOpenDialog = async () => {
      globalThis.__e2eDialogCalls++
      return folder ? { canceled: false, filePaths: [folder] } : { canceled: true, filePaths: [] }
    }
  }, returns)
  return async () => app.evaluate(() => globalThis.__e2eDialogCalls ?? 0)
}

/** Replace the elevated-content review dialog and drive its answer.
 *  `response`: 0 = Open safely (sanitized), 1 = Trust and run, 2 = Cancel. */
export async function stubReviewDialog(app, { response, checkboxChecked = false }) {
  await app.evaluate(
    async ({ dialog }, answer) => {
      globalThis.__e2eReviewCalls = []
      dialog.showMessageBox = async (_win, opts) => {
        globalThis.__e2eReviewCalls.push({
          message: opts?.message ?? '',
          detail: opts?.detail ?? ''
        })
        return { response: answer.response, checkboxChecked: answer.checkboxChecked }
      }
    },
    { response, checkboxChecked }
  )
  return async () => app.evaluate(() => globalThis.__e2eReviewCalls ?? [])
}

/** The labels of the sidebar's session rows. */
export function sidebarRows(win) {
  return win.evaluate(() =>
    [...document.querySelectorAll('[class*="sidebar-item"]')].map((r) =>
      (r.textContent || '').trim()
    )
  )
}

/** The agent button's current label — what one click would launch. */
export function agentButtonLabel(win) {
  return win.evaluate(() =>
    (document.querySelector('.launcher-split .launcher-btn')?.textContent || '').trim()
  )
}
