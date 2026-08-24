/**
 * The side panel's chrome and its repo tree's rules.
 *
 * Two things this covers, both of which were wrong before:
 *
 * 1. The rules in the git tab's repo tree. They used to be drawn at the FOOT of
 *    a block and only by a repo, so a folder full of repos came out ruled under
 *    every repo and under nothing else — a line under the last repo inside a
 *    folder, none between the folders themselves. They are drawn at the HEAD of
 *    a block now, at the depth of the row that opens it, which is the only
 *    depth that is knowable at the boundary.
 * 2. The chrome. The two tabs each had their own collapse-all and the file tab
 *    its own folder picker; those are one bar over both tabs now, and each tab's
 *    own controls sit in a second bar of the same material. That bar must not
 *    wrap at the panel's default width — the whole point of the cluster.
 *
 * The fixture is a folder that is NOT itself a repo holding repos at several
 * depths, some directly, some under plain folders. That mixture is the case the
 * old rules got wrong, and `/private/tmp` rather than `/tmp` so git's resolved
 * repo root matches the discovered path (the symlink otherwise makes every repo
 * look like it belongs to a parent).
 */
import {
  launchApp,
  seedWorkspaces,
  seedTrustedRoots,
  userDataDir,
  callMcp,
  stubFolderDialog
} from './harness.mjs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const DIR = userDataDir('side-panel')
const ROOT = '/private/tmp/clave-e2e-side-panel-root'
const WS = {
  id: 'dddddddd-0000-4000-8000-00000000000d',
  name: 'Panel',
  rootDir: ROOT,
  profileFile: null,
  createdAt: 1
}

// alpha-app sits at the top level; the rest are behind plain folders, one of
// them two levels down. Two repos share `labs/products` so the tree has a
// same-depth boundary as well as the shallower ones.
const REPOS = [
  'alpha-app',
  'company/website',
  'labs/products/beta-core',
  'labs/products/gamma-web',
  'labs/services/scheduler'
]

// A second folder, over the DEFAULT live-poll limit (50), for the footnote.
// Bare inits: the note is about how many repos there are, not what is in them.
const BIG_ROOT = '/private/tmp/clave-e2e-side-panel-big'
const BIG_COUNT = 51

function seedBigRoot() {
  rmSync(BIG_ROOT, { recursive: true, force: true })
  for (let i = 0; i < BIG_COUNT; i++) {
    const dir = path.join(BIG_ROOT, `repo-${String(i).padStart(2, '0')}`)
    mkdirSync(dir, { recursive: true })
    execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main'], { stdio: 'ignore' })
    writeFileSync(path.join(dir, 'work.txt'), 'x\n')
  }
}

function seedRepos() {
  rmSync(ROOT, { recursive: true, force: true })
  for (const rel of REPOS) {
    const dir = path.join(ROOT, rel)
    mkdirSync(dir, { recursive: true })
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
    git('init', '-q', '-b', 'main')
    writeFileSync(path.join(dir, 'README.md'), `# ${path.basename(rel)}\n`)
    git('add', '-A')
    git('-c', 'user.email=e2e@clave', '-c', 'user.name=e2e', 'commit', '-qm', 'init')
    // One untracked file, so every repo has something to unfold.
    writeFileSync(path.join(dir, 'work.txt'), 'dirty\n')
  }
}

/** The tree's rows and rules in document order — shape, not pixels. */
function readTree(win) {
  return win.evaluate(() =>
    [...document.querySelectorAll('[data-tree-row], [data-tree-rule]')].map((el) =>
      el.hasAttribute('data-tree-rule')
        ? { kind: 'rule', depth: Number(el.getAttribute('data-tree-rule')) }
        : {
            kind: el.getAttribute('data-tree-kind'),
            depth: Number(el.getAttribute('data-tree-row')),
            name: el.getAttribute('data-tree-name')
          }
    )
  )
}

export async function run(t) {
  seedRepos()
  seedBigRoot()
  seedWorkspaces(DIR, { workspaces: [WS], activeWorkspaceId: WS.id, fresh: true })
  seedTrustedRoots(DIR, [ROOT, BIG_ROOT])

  const { app, win } = await launchApp(DIR)
  try {
    await callMcp(app, 'openSession', { cwd: ROOT, mode: 'terminal', name: 'panel' })
    await win.waitForTimeout(2000)
    await win.click('button[title^="File tree"]')
    await win.waitForTimeout(1200)

    // ── The tab bar carries what both tabs share ──────────────────────────
    const bar = await win.evaluate(() => {
      const el = document.querySelector('[data-panel-bar="tabs"]')
      if (!el) return null
      const label = (sel) => !!el.querySelector(sel)
      return {
        tabs: [...el.querySelectorAll('.panel-tab')].map((b) => b.textContent.trim()),
        folder: label('[aria-label="Open another folder"]'),
        collapse: label('[aria-label="Collapse all"]'),
        help: label('[aria-label="Help"]')
      }
    })
    t.check('the panel has one tab bar', bar !== null, bar)
    t.check(
      'it holds both tabs',
      JSON.stringify(bar?.tabs) === JSON.stringify(['Files', 'Git']),
      bar?.tabs
    )
    t.check('the folder picker is shared, not per tab', bar?.folder === true)
    t.check('collapse-all is shared, not per tab', bar?.collapse === true)
    t.check('help is in the bar', bar?.help === true)

    // Neither tab may keep a second copy of a shared control — asserted once per
    // tab, WHILE that tab is mounted. Checking both selectors from the file tab
    // is what let a collapse-all put back in the git bar survive: the git bar is
    // not in the DOM until you are on it, so the selector matched nothing and
    // the check passed for the wrong reason.
    const straysIn = (which) =>
      win.evaluate(
        (w) =>
          document.querySelectorAll(`[data-panel-bar="${w}"] [aria-label="Collapse all"]`).length,
        which
      )
    t.equal('the file tab keeps no collapse-all of its own', await straysIn('files'), 0)

    // ── The file tab's bar is the shared search field ─────────────────────
    const filterField = await win.evaluate(() => {
      const input = document.querySelector('[data-panel-bar="files"] .search-field input')
      return input ? { placeholder: input.placeholder } : null
    })
    t.check('the filter is the search field the sidebar uses', filterField !== null, filterField)

    const rowsBeforeFilter = await win.evaluate(
      () => document.querySelectorAll('[data-tree-item]').length
    )
    await win.fill('[data-panel-bar="files"] .search-field input', 'README')
    await win.waitForTimeout(1500)
    const filtered = await win.evaluate(() =>
      [...document.querySelectorAll('[data-tree-item]')].map((r) => r.textContent.trim())
    )
    t.check(
      'the filter narrows the tree to matches',
      filtered.length > 0 && filtered.every((r) => r.toLowerCase().includes('readme')),
      filtered.slice(0, 6)
    )
    await win.click('[data-panel-bar="files"] .search-field-clear')
    await win.waitForTimeout(1200)
    t.equal(
      'clearing the filter restores the tree',
      await win.evaluate(() => document.querySelectorAll('[data-tree-item]').length),
      rowsBeforeFilter
    )

    // ── Collapse-all reaches the file tree from the shared bar ────────────
    await win.evaluate(() => {
      const dir = [...document.querySelectorAll('[data-tree-item]')].find((r) =>
        r.textContent.includes('labs')
      )
      dir?.click()
    })
    await win.waitForTimeout(1200)
    const expandedFiles = await win.evaluate(
      () => document.querySelectorAll('[data-tree-item]').length
    )
    t.check('a folder opens in the file tree', expandedFiles > rowsBeforeFilter, {
      expandedFiles,
      rowsBeforeFilter
    })
    await win.click('[data-panel-bar="tabs"] [aria-label="Collapse all"]')
    await win.waitForTimeout(800)
    t.equal(
      'the shared collapse-all folds the file tree',
      await win.evaluate(() => document.querySelectorAll('[data-tree-item]').length),
      rowsBeforeFilter
    )

    // ── The git tab ───────────────────────────────────────────────────────
    await win.evaluate(() => {
      ;[...document.querySelectorAll('.panel-tab')]
        .find((b) => b.textContent.trim() === 'Git')
        ?.click()
    })
    await win.waitForTimeout(6000)

    const gitBar = await win.evaluate(() => {
      const el = document.querySelector('[data-panel-bar="git"]')
      return el ? { height: el.offsetHeight, width: el.clientWidth } : null
    })
    t.check('the git tab has a bar of its own', gitBar !== null)
    t.equal('the git tab keeps no collapse-all of its own', await straysIn('git'), 0)
    t.check('the git bar is one line at the default width', (gitBar?.height ?? 99) <= 36, gitBar)

    // The real test of the cluster: drag the panel to its 180px minimum, where
    // the bar's contents no longer fit. It must truncate its label, not drop an
    // orphan icon onto a second line — which is exactly what it did before.
    const narrowed = await (async () => {
      const box = await win.evaluate(() => {
        const el = document
          .querySelector('[data-panel-bar="git"]')
          .closest('[class*="overflow-hidden"]')
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, height: r.height }
      })
      await win.mouse.move(box.x + 2, box.y + box.height / 2)
      await win.mouse.down()
      // Well past the 180px clamp, so the drag lands ON the minimum.
      await win.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 8 })
      await win.mouse.up()
      await win.waitForTimeout(1200)
      return win.evaluate(() => {
        const el = document.querySelector('[data-panel-bar="git"]')
        return { height: el.offsetHeight, width: el.clientWidth }
      })
    })()
    t.check('the panel actually narrowed', narrowed.width < (gitBar?.width ?? 0), {
      gitBar,
      narrowed
    })
    t.check('the git bar stays on one line at the minimum width', narrowed.height <= 36, narrowed)

    const seq = await readTree(win)
    const rows = seq.filter((e) => e.kind !== 'rule')
    t.check('the repo tree rendered', rows.length >= REPOS.length, seq)

    // ── The rules: one at every block boundary, none anywhere else ────────
    // A row opens a new block — and closes the one above it — exactly when it
    // is no deeper than the row before it. A DEEPER row is the previous row's
    // own child, and a rule there would cut a folder off from its first repo.
    const problems = []
    let prev = null
    let pendingRule = null
    for (const entry of seq) {
      if (entry.kind === 'rule') {
        if (pendingRule !== null) problems.push(`two rules in a row before ${entry.depth}`)
        pendingRule = entry.depth
        continue
      }
      if (prev === null) {
        if (pendingRule !== null) problems.push(`rule above the first row (${entry.name})`)
      } else {
        const wanted = entry.depth <= prev.depth
        if (wanted && pendingRule === null) {
          problems.push(
            `no rule between ${prev.name}(${prev.depth}) and ${entry.name}(${entry.depth})`
          )
        }
        if (!wanted && pendingRule !== null) {
          problems.push(`rule between ${prev.name} and its child ${entry.name}`)
        }
        if (wanted && pendingRule !== null && pendingRule !== entry.depth) {
          problems.push(`rule above ${entry.name} at depth ${pendingRule}, wanted ${entry.depth}`)
        }
      }
      pendingRule = null
      prev = entry
    }
    t.check(
      'every block boundary carries a rule, at the new block’s depth',
      problems.length === 0,
      problems
    )

    // The bug in one assertion: folders never got a rule at all, so a mixed
    // tree ruled under repos and nowhere else.
    const ruledDirs = seq.filter(
      (e, i) => e.kind === 'dir' && i > 0 && seq[i - 1].kind === 'rule'
    ).length
    t.check('a folder closing the block above it is ruled off', ruledDirs > 0, seq)

    // ── Collapse-all reaches the repo tree from the same button ───────────
    const rowsExpanded = (await readTree(win)).filter((e) => e.kind !== 'rule').length
    await win.click('[data-panel-bar="tabs"] [aria-label="Collapse all"]')
    await win.waitForTimeout(1200)
    const afterCollapse = (await readTree(win)).filter((e) => e.kind !== 'rule')
    t.check('the shared collapse-all folds the repo tree', afterCollapse.length < rowsExpanded, {
      rowsExpanded,
      after: afterCollapse.length
    })
    t.check(
      'and leaves only top-level rows',
      afterCollapse.length > 0 && afterCollapse.every((r) => r.depth === 0),
      afterCollapse
    )
    // Folding must not leave the rules behind: the boundaries are recomputed
    // from the rows that remain.
    const foldedSeq = await readTree(win)
    let foldedProblems = 0
    for (let i = 0; i < foldedSeq.length; i++) {
      if (foldedSeq[i].kind !== 'rule') continue
      const next = foldedSeq[i + 1]
      if (!next || next.kind === 'rule' || next.depth !== foldedSeq[i].depth) foldedProblems++
    }
    t.equal('folded, every rule still sits above a row of its own depth', foldedProblems, 0)
    // ── The paused-updates footnote ───────────────────────────────────────
    // Reached the way a user reaches it: the tab bar's folder picker, pointed
    // at a folder with more repos than the DEFAULT limit. (Setting the limit by
    // hand needs a reload, and a reloaded window has no focused session, so the
    // panel has no folder to be paused about.)
    await stubFolderDialog(app, { returns: BIG_ROOT })
    await win.click('[data-panel-bar="tabs"] [aria-label="Open another folder"]')
    await win.waitForTimeout(9000)

    const note = await win.evaluate(() => {
      const el = document.querySelector('[data-git-footnote]')
      if (!el) return null
      const scroller = document.querySelector('[data-tree-row]')?.closest('.overflow-y-auto')
      return {
        text: el.textContent.trim(),
        body: !!el.querySelector('[data-git-footnote-body]'),
        // Below the list, not above it: the whole point of moving it.
        belowTree: scroller
          ? el.getBoundingClientRect().top >= scroller.getBoundingClientRect().bottom - 1
          : null
      }
    })
    // Asserted on the path, not on the footnote below: two separate claims, and
    // conflating them made a missing footnote read as a broken folder picker.
    const landedOn = await win.evaluate(
      () => document.querySelector('[data-panel-bar="tabs"]')?.parentElement?.textContent ?? ''
    )
    t.check(
      'the folder picker in the tab bar navigates the panel',
      landedOn.includes('side-panel-big'),
      landedOn.slice(0, 80)
    )
    t.check('a footnote appears when live updates pause', note !== null, note)
    t.check('it sits below the tree, not above it', note?.belowTree === true, note)
    t.check('it is folded by default', note?.body === false, note)
    // Folded it is one short line. The old banner spelled the count, the pause
    // and the timestamp across the top of the list you came to read.
    t.check('folded, it is a short line', (note?.text.length ?? 999) < 60, note?.text)

    await win.click('[data-git-footnote-toggle]')
    await win.waitForTimeout(600)
    const opened = await win.evaluate(() => {
      const body = document.querySelector('[data-git-footnote-body]')
      return body
        ? {
            text: body.textContent.trim(),
            settings: !!document.querySelector('[data-git-footnote-settings]'),
            buttons: body.querySelectorAll('.git-footnote-buttons button').length
          }
        : null
    })
    t.check('opening it explains why', (opened?.text.length ?? 0) > 60, opened)
    t.check('and offers one way to change the limit', opened?.settings === true, opened)
    t.equal('exactly one button, not a menu of them', opened?.buttons ?? -1, 1)

    const limitBefore = await win.evaluate(() =>
      localStorage.getItem('clave-git-live-poll-limit')
    )
    await win.click('[data-git-footnote-settings]')
    await win.waitForTimeout(1500)

    // It opens the setting; it does not silently move it. A button that changed
    // the limit and then retired the note left no way back to what it changed.
    t.check(
      'the button opens the setting rather than changing it',
      await win.evaluate(() => document.body.innerText.includes('Pause live updates above')),
      (await win.evaluate(() => document.body.innerText)).slice(0, 200)
    )
    t.equal(
      'and the limit is untouched until the user edits it',
      await win.evaluate(() => localStorage.getItem('clave-git-live-poll-limit')),
      limitBefore
    )

  } finally {
    await app.close()
    rmSync(ROOT, { recursive: true, force: true })
    rmSync(BIG_ROOT, { recursive: true, force: true })
  }
}
