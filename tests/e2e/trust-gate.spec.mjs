/**
 * The `.clave` TRUST BOUNDARY, end to end.
 *
 * `clave-trust-boundary.test.ts` covers the two pure functions that decide what
 * the review dialog discloses and what "Open safely" strips. Those only matter
 * if something actually calls them, and that decision — is this file under a
 * trusted root, is its content elevated, what did the user answer — lives in the
 * read handler and was entirely unasserted. Making `isUnderTrustedRoot` always
 * return true left every gate green while an untrusted file ran fully elevated
 * with no dialog at all.
 *
 * So this spec asserts the WIRING, not the logic: that an untrusted file with a
 * group-level prompt raises the dialog, that the dialog names the prompt, and
 * that "Open safely" delivers a file with no prompt in it.
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  stubReviewDialog
} from './harness.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = userDataDir('trust-gate')
const ROOT = '/tmp/clave-e2e-untrusted-root'
const CLAVE = `${ROOT}/untrusted.clave`
const PROMPT = 'UNTRUSTED-BRIEF-MARKER do the thing'
const WS = {
  id: 'dddddddd-0000-4000-8000-00000000000d',
  name: 'Untrusted',
  rootDir: ROOT,
  profileFile: null,
  createdAt: 1
}

/** Read the file through the app, with the review dialog answered for us. */
async function readUnderDialog(win, path) {
  return win.evaluate(async (p) => {
    const r = await window.electronAPI.readClaveFile(p, p.replace(/\/[^/]+$/, ''))
    return r ? { name: r.name ?? null, prompt: r.prompt ?? null } : null
  }, path)
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(
    CLAVE,
    JSON.stringify(
      {
        $schema: 'clave/1.0',
        name: 'Untrusted Lane',
        cwd: '.',
        prompt: PROMPT,
        sessions: [
          {
            cwd: '.',
            name: 'tab',
            claudeMode: true,
            antigravityMode: false,
            codexMode: false,
            dangerousMode: false
          }
        ],
        terminals: []
      },
      null,
      2
    )
  )
  // Deliberately NO trusted roots: this file must be treated as untrusted.
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [])

  const { app, win } = await launchApp(DIR)
  try {
    // Answer order matters: "Trust and run" trusts this exact CONTENT for the
    // rest of the run, so it must come last or the later cases never see a
    // dialog at all. (Discovered by this spec failing — the app was right.)

    // ── Cancel (response 2) ──
    let readDialogs = await stubReviewDialog(app, { response: 2 })
    let result = await readUnderDialog(win, CLAVE)
    t.check('an untrusted group prompt raises the review dialog', (await readDialogs()).length > 0)
    t.equal('cancelling refuses the file outright', result, null)

    // ── "Open safely" (response 0) ──
    readDialogs = await stubReviewDialog(app, { response: 0 })
    result = await readUnderDialog(win, CLAVE)
    const dialogs = await readDialogs()
    t.check(
      'the dialog names the prompt it would auto-submit',
      dialogs.some((d) => `${d.message}${d.detail}`.includes(PROMPT)),
      dialogs
    )
    t.check('the file still opens', result !== null, result)
    t.equal('but "Open safely" delivers it with NO prompt', result?.prompt ?? null, null)
    t.equal('while keeping the harmless parts', result?.name, 'Untrusted Lane')

    // ── "Trust and run" (response 1) — same wiring, opposite answer ──
    await stubReviewDialog(app, { response: 1 })
    result = await readUnderDialog(win, CLAVE)
    t.equal('choosing "Trust and run" keeps the prompt', result?.prompt ?? null, PROMPT)
  } finally {
    await app.close()
  }
}
