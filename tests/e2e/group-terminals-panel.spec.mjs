/**
 * The group header's terminals button and panel (PRDCT-1670).
 *
 * The header used to lay every terminal's icon out in a row that ran off the
 * sidebar past a handful, truncating the group's name first. Now it carries
 * two controls whatever the count — a terminals button (icon + count, lit in
 * a running terminal's colour) and a `+` for a new session — and the
 * terminals live in a panel the button opens on hover or click.
 */
import { launchApp, seedWorkspaces, seedTrustedRoots, userDataDir } from './harness.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = userDataDir('group-terminals-panel')
const ROOT = '/tmp/clave-e2e-terminals-panel-root'
const CLAVE = `${ROOT}/many.clave`
const WS = {
  id: 'cccccccc-0000-4000-8000-00000000000c',
  name: 'Terminals',
  rootDir: ROOT,
  profileFile: CLAVE,
  createdAt: 1
}

const COLORS = ['green', 'teal', 'blue', 'purple', 'yellow', 'pink', 'red', 'black', 'green', 'teal', 'blue', 'purple']
const ICONS = ['bolt', 'globe', 'cube', 'eye', 'signal', 'fire', 'rocket', 'star', 'heart', 'wrench', 'beaker', 'cloud']
const TERMINAL_COUNT = 12

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(
    CLAVE,
    JSON.stringify(
      {
        $schema: 'clave/1.0',
        groups: [
          {
            name: 'A group with a dozen terminals and a long name',
            cwd: '.',
            color: 'teal',
            sessions: [
              { cwd: '.', name: 'seed', claudeMode: false, antigravityMode: false, codexMode: false, dangerousMode: false }
            ],
            terminals: Array.from({ length: TERMINAL_COUNT }, (_, i) => ({
              // prefill: the command is typed, never run, so nothing lingers.
              command: `echo terminal-${i + 1}`,
              commandMode: 'prefill',
              color: COLORS[i],
              icon: ICONS[i]
            }))
          }
        ]
      },
      null,
      2
    )
  )
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])

  const { app, win } = await launchApp(DIR)
  try {
    await win.click('button[aria-label="Add a group"]')
    await win.waitForTimeout(700)
    await win.locator('.group-picker-card').first().click()
    await win.waitForTimeout(5000)

    const header = win.locator('[data-sidebar-item-type="group"]').first()
    t.check('the group is on screen', (await header.count()) === 1)

    // ── Nothing runs off the sidebar, and the name keeps room ──
    const geometry = await win.evaluate(() => {
      const headerEl = document.querySelector('[data-sidebar-item-type="group"]')
      const sidebar = headerEl?.closest('aside, [data-sidebar], nav') ?? headerEl?.parentElement?.parentElement
      const btn = headerEl?.querySelector('[data-group-terminals]')
      const plus = headerEl?.querySelector('[aria-label^="New session in"]')
      const name = headerEl?.querySelector('span.truncate')
      const box = (el) => (el ? el.getBoundingClientRect() : null)
      return {
        header: box(headerEl),
        btn: box(btn),
        plus: box(plus),
        name: box(name),
        count: btn?.querySelector('.group-terminals-count')?.textContent ?? null,
        oldIconRow: headerEl?.querySelectorAll('.terminal-icon').length ?? 0,
        addRows: document.querySelectorAll('.group-add-row').length
      }
    })
    t.check('the terminals button is inside the header', geometry.btn && geometry.btn.right <= geometry.header.right + 0.5, geometry)
    t.check('the + is inside the header', geometry.plus && geometry.plus.right <= geometry.header.right + 0.5, geometry)
    t.check('the name still has at least 60px', geometry.name && geometry.name.width >= 60, geometry)
    t.equal('the button shows the terminal count', geometry.count, String(TERMINAL_COUNT))
    t.equal('no per-terminal icons are laid out in the header any more', geometry.oldIconRow, 0)
    t.equal('the per-group "New session" row is gone', geometry.addRows, 0)

    // ── Hover opens the panel with every terminal and a "New terminal" row ──
    await header.locator('[data-group-terminals]').hover()
    await win.waitForTimeout(500)
    const panel = win.locator('[data-group-terminals-panel]')
    t.equal('hovering the button opens the panel', await panel.count(), 1)
    t.equal('the panel lists every terminal', await panel.locator('[data-terminal-row]').count(), TERMINAL_COUNT)
    t.equal('the panel ends with a New terminal row', await panel.locator('[data-add-terminal]').count(), 1)
    t.equal('nothing is running yet', await panel.locator('[data-terminal-row][data-running="true"]').count(), 0)

    // ── Clicking a row starts that terminal; the button lights up ──
    await panel.locator('[data-terminal-row]').nth(2).click()
    await win.waitForTimeout(2500)
    const lit = await header.locator('[data-group-terminals][data-running="true"]').count()
    t.equal('the terminals button is lit once a terminal runs', lit, 1)
    const litColor = await header.locator('[data-group-terminals]').evaluate((el) => el.style.color)
    t.check('it carries the running terminal\'s colour', litColor && litColor !== '', litColor)

    await header.locator('[data-group-terminals]').hover()
    await win.waitForTimeout(500)
    t.equal('the panel marks that terminal as running', await panel.locator('[data-terminal-row][data-running="true"]').count(), 1)

    // ── Leaving closes it ──
    await win.mouse.move(5, 5)
    await win.waitForTimeout(600)
    t.equal('the panel closes when the cursor leaves', await panel.count(), 0)
  } finally {
    await app.close()
  }
}
