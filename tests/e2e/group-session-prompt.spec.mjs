/**
 * The group `+` inherits the brief from the group's FIRST SESSION when the
 * `.clave` declares no group-level `prompt`.
 *
 * group-prompt.spec.mjs covers the group-level `prompt` field, and that field
 * works. The gap this closes is that no workspace file in the fleet uses it:
 * every `<slug>-os/.clave/workspaces/default.clave` we author puts the project
 * briefing on `sessions[0].prompt`, so the `+` read a field that was always
 * null and launched a bare agent into a project group — the tooltip going quiet
 * being the only hint, and only if you knew to look at it.
 *
 * The shape of the file here is the real one: a single session carrying the
 * brief, `rootSession: true`, an @-token in the text. Assertions are on the
 * `pty:spawn` payload for the same reason group-prompt.spec.mjs is — a tooltip
 * promising a prompt proves the renderer holds a string, never that anything
 * was handed to the agent.
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  spyPtySpawn
} from './harness.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = userDataDir('group-session-prompt')
const ROOT = '/tmp/clave-e2e-session-prompt-root'
const PROJECT = `${ROOT}/labs/widget`
const CLAVE = `${ROOT}/project.clave`
const MARKER = 'e2e-session-brief-marker'
const WS = {
  id: 'dddddddd-0000-4000-8000-00000000000d',
  name: 'Projects',
  rootDir: ROOT,
  profileFile: CLAVE,
  createdAt: 1
}

export async function run(t) {
  mkdirSync(PROJECT, { recursive: true })
  writeFileSync(
    CLAVE,
    JSON.stringify(
      {
        $schema: 'clave/1.0',
        name: 'Widget',
        cwd: 'labs/widget',
        color: 'blue',
        category: 'Products',
        // Deliberately NO group-level `prompt` — this is the shape every real
        // workspace file has, and the shape the `+` used to come up empty on.
        sessions: [
          {
            cwd: 'labs/widget',
            name: 'Widget',
            claudeMode: false,
            antigravityMode: false,
            codexMode: true,
            dangerousMode: false,
            rootSession: true,
            prompt: `${MARKER} — the project lives at @project_path`
          }
        ],
        terminals: []
      },
      null,
      2
    )
  )
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])

  const { app, win } = await launchApp(DIR)
  try {
    // CONTROL: the parser really does leave the group-level prompt empty, so a
    // pass below cannot come from the file secretly carrying one.
    const read = await win.evaluate(async (p) => {
      const r = await window.electronAPI.readClaveFile(p, p.replace(/\/[^/]+$/, ''))
      return { groupPrompt: r?.prompt ?? null, sessionPrompt: r?.sessions?.[0]?.prompt ?? null }
    }, CLAVE)
    t.equal('CONTROL: the file declares no group-level prompt', read.groupPrompt, null)
    t.check(
      'and carries the brief on its first session',
      (read.sessionPrompt ?? '').includes(MARKER),
      read.sessionPrompt
    )

    // Remember Codex: an agent that takes a prompt AND puts it somewhere the
    // spawn payload can be read from.
    await win.click('.launcher-caret')
    await win.waitForTimeout(800)
    await win.click('[role="menuitem"]:has-text("Codex CLI")')
    await win.waitForTimeout(4000)

    await win.click('button[aria-label="Add a group"]')
    await win.waitForTimeout(700)
    await win.click('.group-picker-card')
    await win.waitForTimeout(6000)

    const addRow = await win.evaluate(() => document.querySelector('.group-add-row')?.title ?? null)
    t.check(
      "the + row promises the group's prompt",
      /starts on the group's prompt/.test(addRow ?? ''),
      addRow
    )

    const readSpawns = await spyPtySpawn(app)
    await win.click('.group-add-row')
    await win.waitForTimeout(4000)

    const spawns = await readSpawns()
    t.equal('the + issues exactly one spawn', spawns.length, 1)
    const sent = spawns[0] ?? {}
    t.check(
      "carrying the first session's brief",
      typeof sent.initialPrompt === 'string' && sent.initialPrompt.includes(MARKER),
      sent.initialPrompt
    )
    t.check(
      'with @project_path expanded against the group directory',
      (sent.initialPrompt ?? '').includes('labs/widget'),
      sent.initialPrompt
    )
    t.check(
      'and no raw token left behind',
      !(sent.initialPrompt ?? '').includes('@project_path'),
      sent.initialPrompt
    )
    t.equal('into the group’s own directory', sent.cwd, PROJECT)
  } finally {
    await app.close()
  }
}
