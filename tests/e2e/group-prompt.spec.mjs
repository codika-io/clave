/**
 * The group's default prompt actually reaching the agent (PRDCT-1665).
 *
 * This asserts on the SPAWNED PROCESS, not on the UI. The prompt was silently
 * dropped twice on the `.clave` import path while every screen still looked
 * right — a group card showing "prompt" and a `+` row promising it prove only
 * that the renderer has a string, never that the agent got one.
 */
import { launchApp, seedWorkspaces, seedTrustedRoots, userDataDir } from './harness.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = userDataDir('group-prompt')
const ROOT = '/tmp/clave-e2e-group-root'
const CLAVE = `${ROOT}/lane.clave`
const MARKER = 'e2e-group-brief-marker'
const WS = {
  id: 'cccccccc-0000-4000-8000-00000000000c',
  name: 'Lanes',
  rootDir: ROOT,
  profileFile: CLAVE,
  createdAt: 1
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(
    CLAVE,
    JSON.stringify(
      {
        $schema: 'clave/1.0',
        name: 'Lane Alpha',
        cwd: '.',
        color: 'teal',
        category: 'Lanes',
        prompt: `${MARKER} at @root_path`,
        sessions: [
          {
            cwd: '.',
            name: 'seed',
            claudeMode: false,
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
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])

  const { app, win } = await launchApp(DIR)
  try {
    // The parser must carry the group-level prompt off disk at all.
    const read = await win.evaluate(async (p) => {
      const r = await window.electronAPI.readClaveFile(p, p.replace(/\/[^/]+$/, ''))
      return { type: r?.type ?? null, prompt: r?.prompt ?? null }
    }, CLAVE)
    t.equal('the .clave parser reads the group prompt', read.prompt, `${MARKER} at @root_path`)

    // Remember Codex, so the group `+` launches an agent that takes a prompt
    // AND puts it on a command line this spec can read.
    await win.click('.launcher-caret')
    await win.waitForTimeout(800)
    await win.click('[role="menuitem"]:has-text("Codex CLI")')
    await win.waitForTimeout(4000)

    // Add the group through the picker.
    await win.click('button[aria-label="Add a group"]')
    await win.waitForTimeout(700)
    const picker = await win.evaluate(() => {
      const panel = document.querySelector('.group-picker-panel')
      return panel
        ? {
            search: !!panel.querySelector('input'),
            cards: panel.querySelectorAll('.group-picker-card').length
          }
        : null
    })
    t.check('the group picker opens with a search field', picker?.search === true, picker)
    t.equal('and lists the group as a card', picker?.cards, 1)
    await win.click('.group-picker-card')
    await win.waitForTimeout(5000)
    t.check(
      'picking closes the picker',
      await win.evaluate(() => !document.querySelector('.group-picker-panel'))
    )

    // The group's `+`.
    const addRow = await win.evaluate(() => document.querySelector('.group-add-row')?.title ?? null)
    t.check(
      'the + row promises the group prompt',
      /starts on the group's prompt/.test(addRow ?? ''),
      addRow
    )
    const before = await win.evaluate(
      () => document.querySelectorAll('[class*="sidebar-item"]').length
    )
    await win.click('.group-add-row')
    await win.waitForTimeout(4000)
    const after = await win.evaluate(
      () => document.querySelectorAll('[class*="sidebar-item"]').length
    )
    t.equal('the + launches one session', after, before + 1)
    t.check(
      'and puts it inside the group',
      await win.evaluate(() => (document.querySelector('.group-rail')?.children.length ?? 0) >= 3),
      await win.evaluate(() => document.querySelector('.group-rail')?.children.length ?? 0)
    )

    // KNOWN GAP — the expanded prompt reaching the agent's command line is NOT
    // asserted here. `pty:spawn` only creates the session record; the command
    // runs when the terminal mounts and calls `pty:start`, so a tab that is not
    // on screen has no process to inspect, and focusing it from the harness did
    // not reliably start one. Checking `ps` anyway passes or fails on which tab
    // happened to be visible — worse than not checking, because it reads as
    // proof. What IS covered: the parser reads the group prompt (above), token
    // expansion is unit tested in store/prompt-tokens.test.ts, and the launcher
    // spec proves the agent choice reaches the spawn. Closing this properly
    // needs a hook at `pty:start` — tracked as PRDCT-1677, not faked.
  } finally {
    await app.close()
  }
}
