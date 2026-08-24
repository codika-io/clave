/**
 * A group's `+` must land its session in THAT group (PRDCT-1665).
 *
 * Deliberately with TWO groups. With one group the check is a tautology:
 * `addSession` already drops a new tab into whatever the user has selected, so
 * removing the explicit placement leaves single-group behaviour identical and
 * the assertion passes on an accident. The bug only appears when the group you
 * pressed `+` on is not the group you had selected — which is the normal case
 * once more than one lane is running, and the whole point of the button.
 */
import { launchApp, seedWorkspaces, seedTrustedRoots, userDataDir } from './harness.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const DIR = userDataDir('group-placement')
const ROOT = '/tmp/clave-e2e-placement-root'
const CLAVE = `${ROOT}/two-lanes.clave`
const WS = {
  id: 'eeeeeeee-0000-4000-8000-00000000000e',
  name: 'Placement',
  rootDir: ROOT,
  profileFile: CLAVE,
  createdAt: 1
}

const lane = (name, color) => ({
  name,
  cwd: '.',
  color,
  sessions: [
    {
      cwd: '.',
      name: `${name}-seed`,
      claudeMode: false,
      antigravityMode: false,
      codexMode: false,
      dangerousMode: false
    }
  ],
  terminals: []
})

/** Session-row counts per rendered group, in sidebar order. */
function groupSizes(win) {
  return win.evaluate(() =>
    [...document.querySelectorAll('.group-rail')].map(
      (rail) => rail.querySelectorAll('[class*="sidebar-item"]').length
    )
  )
}

export async function run(t) {
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(
    CLAVE,
    JSON.stringify(
      { $schema: 'clave/1.0', groups: [lane('Lane A', 'teal'), lane('Lane B', 'purple')] },
      null,
      2
    )
  )
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT])

  const { app, win } = await launchApp(DIR)
  try {
    // Pins do not launch themselves; stamp both groups out of the picker, the
    // way a user does.
    for (const nth of [0, 1]) {
      await win.click('button[aria-label="Add a group"]')
      await win.waitForTimeout(700)
      await win.locator('.group-picker-card').nth(nth).click()
      await win.waitForTimeout(6000)
    }

    const before = await groupSizes(win)
    t.equal('two groups are on screen', before.length, 2)

    // Select the SECOND group, then press the FIRST group's `+`. Without the
    // explicit placement the session follows the selection into group B.
    const groups = win.locator('.group-rail')
    await groups.nth(1).locator('[class*="sidebar-item"]').first().click()
    await win.waitForTimeout(1200)

    await win.locator('button[aria-label="Add a group"]').waitFor()
    await win.locator('[aria-label="New session in Lane A"]').click()
    await win.waitForTimeout(6000)

    const after = await groupSizes(win)
    t.equal('the session landed in the group whose + was pressed', after[0], before[0] + 1)
    t.equal('and not in the one that happened to be selected', after[1], before[1])
  } finally {
    await app.close()
  }
}
