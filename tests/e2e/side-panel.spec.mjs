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
// Bare remotes for the one repo that must sit BEHIND its upstream — outside
// ROOT so the panel does not discover them as repos of their own.
const ORIGINS = '/private/tmp/clave-e2e-side-panel-origins'
const BEHIND_REPO = 'alpha-app'

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
    // Two files a directory deep, so the git tab's TREE mode has a folder row
    // to render — compaction folds a lone child into its parent's path.
    mkdirSync(path.join(dir, 'src'), { recursive: true })
    writeFileSync(path.join(dir, 'src', 'one.txt'), 'one\n')
    writeFileSync(path.join(dir, 'src', 'two.txt'), 'two\n')
    git('add', '-A')
    git('-c', 'user.email=e2e@clave', '-c', 'user.name=e2e', 'commit', '-qm', 'init')
    // One untracked file, so every repo has something to unfold — and one
    // MODIFIED tracked file, which is the row whose tone the tab is judged on.
    writeFileSync(path.join(dir, 'work.txt'), 'dirty\n')
    writeFileSync(path.join(dir, 'README.md'), `# ${path.basename(rel)}\n\nedited\n`)
    writeFileSync(path.join(dir, 'src', 'one.txt'), 'one edited\n')
    writeFileSync(path.join(dir, 'src', 'two.txt'), 'two edited\n')
  }
  seedBehindUpstream()
}

/**
 * One repo left BEHIND a real upstream, so the panel actually renders an
 * incoming (↓) badge. Without it the tone check on those badges asserts over an
 * empty list and passes whatever color they are painted.
 */
function seedBehindUpstream() {
  rmSync(ORIGINS, { recursive: true, force: true })
  mkdirSync(ORIGINS, { recursive: true })
  const bare = path.join(ORIGINS, 'alpha.git')
  const work = path.join(ORIGINS, 'alpha-push')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { stdio: 'ignore' })

  const repo = path.join(ROOT, BEHIND_REPO)
  const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  git(repo, 'remote', 'add', 'origin', bare)
  git(repo, 'push', '-q', '-u', 'origin', 'main')

  // A second clone moves the branch on, then the repo fetches without merging.
  execFileSync('git', ['clone', '-q', bare, work], { stdio: 'ignore' })
  writeFileSync(path.join(work, 'ahead.txt'), 'from the remote\n')
  git(work, 'add', '-A')
  git(work, '-c', 'user.email=e2e@clave', '-c', 'user.name=e2e', 'commit', '-qm', 'remote work')
  git(work, 'push', '-q')
  git(repo, 'fetch', '-q')
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

    // ── The indent guides are the faintest line in the panel ──────────────
    // They used to be drawn on --border, the structural weight, once per level
    // on every row — which turns a tree into a table of gridlines. Asserted as a
    // relation, not a number: whatever the palette is retuned to, a guide must
    // stay lighter than the hairline between blocks, which is itself lighter
    // than a structural border.
    //
    // Swept over ALL THREE themes, because each declares its own value and the
    // app boots in one of them: checking only the active theme let a guide
    // raised back to the border weight in the other two pass untouched.
    const guideSweep = await win.evaluate(() => {
      const root = document.documentElement
      const was = root.getAttribute('data-theme')
      const alpha = (c) => {
        const m = c.match(/rgba?\(([^)]+)\)/)
        if (!m) return null
        const parts = m[1].split(',').map((v) => parseFloat(v))
        return parts.length > 3 ? parts[3] : 1
      }
      const probe = document.createElement('span')
      probe.style.position = 'fixed'
      document.body.appendChild(probe)
      const resolve = (expr) => {
        probe.style.backgroundColor = ''
        probe.style.backgroundColor = expr
        return alpha(getComputedStyle(probe).backgroundColor)
      }
      const out = { count: document.querySelectorAll('.tree-guide').length, themes: {} }
      for (const theme of ['dark', 'light', 'coffee']) {
        if (theme === 'dark') root.removeAttribute('data-theme')
        else root.setAttribute('data-theme', theme)
        const el = document.querySelector('.tree-guide')
        out.themes[theme] = {
          guide: el ? alpha(getComputedStyle(el).backgroundColor) : null,
          rule: resolve('var(--rule-color)'),
          border: resolve('var(--border-color)')
        }
      }
      if (was === null) root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', was)
      probe.remove()
      return out
    })
    t.check('an opened folder draws indent guides', guideSweep.count > 0, guideSweep)
    const themed = Object.entries(guideSweep.themes)
    t.check(
      'every theme declares a guide weight',
      themed.length === 3 && themed.every(([, v]) => typeof v.guide === 'number'),
      guideSweep.themes
    )
    t.check(
      'in every theme a guide is fainter than the hairline between blocks',
      themed.every(([, v]) => v.guide < v.rule),
      guideSweep.themes
    )
    t.check(
      'and in every theme far fainter than a structural border',
      themed.every(([, v]) => v.guide < v.border / 2),
      guideSweep.themes
    )

    await win.click('[data-panel-bar="tabs"] [aria-label="Collapse all"]')
    await win.waitForTimeout(800)
    t.equal(
      'the shared collapse-all folds the file tree',
      await win.evaluate(() => document.querySelectorAll('[data-tree-item]').length),
      rowsBeforeFilter
    )

    // ── Row height: the two tabs are one list to the eye ──────────────────
    // Inside a repo, the git tab used to pack its rows at 20px against the file
    // tree's 28px, so opening a repo dropped you into a denser list than the one
    // you came from and read as clutter. Measured, not asserted from the CSS: a
    // row that grows a taller child grows with it, and that is what would break
    // the parity again.
    const fileRowHeights = await win.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll('[data-tree-item]')].map((el) => el.getBoundingClientRect().height)
      )
    ])
    t.check(
      'every row of the file tree is one height — a folder is not shorter than a file',
      fileRowHeights.length === 1,
      fileRowHeights
    )
    const FILE_ROW_H = fileRowHeights[0]

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

    // The same measurement inside a repo. The shared collapse-all fired on the
    // file tab folds every repo, mounted or not, so unfold one by hand first.
    await win.evaluate(() => {
      document.querySelector('[data-tree-kind="repo"]')?.click()
    })
    await win.waitForTimeout(2500)

    // Both view modes, because they are two different row components and only
    // one of them is on screen at a time — a height fixed in the list rows and
    // left behind in the tree rows is exactly the regression this misses if it
    // only ever looks at the default.
    const measureGitRows = () =>
      win.evaluate(() => {
        const els = [...document.querySelectorAll('[data-git-row]')]
        return {
          count: els.length,
          kinds: [...new Set(els.map((el) => el.getAttribute('data-git-row')))].sort(),
          heights: [...new Set(els.map((el) => el.getBoundingClientRect().height))]
        }
      })

    const listRows = await measureGitRows()
    t.check('a repo unfolded to its files', listRows.count > 0, listRows)
    t.check(
      'a repo’s rows are the height of the file tree’s rows',
      listRows.heights.length === 1 && listRows.heights[0] === FILE_ROW_H,
      { listRows, FILE_ROW_H }
    )

    await win.click('[data-panel-bar="git"] [aria-label="Tree view"]')
    await win.waitForTimeout(1500)
    const treeRows = await measureGitRows()
    t.check(
      'tree view renders folders as well as files',
      treeRows.count > 0 && treeRows.kinds.includes('dir') && treeRows.kinds.includes('file'),
      treeRows
    )
    t.check(
      'and both are the height of the file tree’s rows',
      treeRows.heights.length === 1 && treeRows.heights[0] === FILE_ROW_H,
      { treeRows, FILE_ROW_H }
    )
    await win.click('[data-panel-bar="git"] [aria-label="List view"]')
    await win.waitForTimeout(1500)

    // ── The tones: modified is not a warning ──────────────────────────────
    // Orange is reserved for the one row that is actually a heads-up (a file an
    // incoming change and the working tree both touch). A modified file and an
    // incoming commit are the normal life of a repo and must not wear it.
    //
    // Colors are compared through a probe element rather than against a literal
    // rgb(): tailwind v4 declares its palette in oklch and Chromium hands that
    // string back unconverted, so a hardcoded `rgb(251, 146, 60)` matches
    // nothing and the check passes no matter what color the row is wearing.
    const tones = await win.evaluate(() => {
      const probe = document.createElement('span')
      probe.style.position = 'fixed'
      probe.style.opacity = '0'
      document.body.appendChild(probe)
      const resolve = (expr) => {
        probe.style.color = ''
        probe.style.color = expr
        return getComputedStyle(probe).color
      }
      const wanted = {
        modified: resolve('var(--color-git-modified)'),
        incoming: resolve('var(--color-git-incoming)'),
        orange: resolve('var(--color-orange-400)')
      }
      const letters = [...document.querySelectorAll('[data-git-row="file"] .font-mono')].map(
        (el) => ({ letter: el.textContent.trim(), color: getComputedStyle(el).color })
      )
      const badges = [...document.querySelectorAll('.git-sync-badge')].map((el) => ({
        text: el.textContent.trim(),
        color: getComputedStyle(el).color
      }))
      probe.remove()
      return { wanted, letters, badges }
    })
    t.check(
      'the tones resolve to three distinct colors',
      new Set(Object.values(tones.wanted)).size === 3,
      tones.wanted
    )
    const modifiedLetters = tones.letters.filter((l) => l.letter === 'M')
    t.check('the repo has a modified file to judge', modifiedLetters.length > 0, tones.letters)
    t.check(
      'a modified file wears the modified tone, not orange',
      modifiedLetters.every((l) => l.color === tones.wanted.modified),
      { modifiedLetters, wanted: tones.wanted.modified }
    )
    t.check(
      'no status letter is painted orange',
      tones.letters.every((l) => l.color !== tones.wanted.orange),
      tones.letters
    )
    const incomingBadges = tones.badges.filter((b) => b.text.startsWith('\u2193'))
    t.check(
      'a repo is behind its upstream, so there is an incoming badge to judge',
      incomingBadges.length > 0,
      tones.badges
    )
    t.check(
      'the incoming badge wears the incoming tone, not orange',
      incomingBadges.every((b) => b.color === tones.wanted.incoming),
      { incomingBadges, wanted: tones.wanted.incoming }
    )
    t.check(
      'no sync badge is painted orange',
      tones.badges.every((b) => b.color !== tones.wanted.orange),
      tones.badges
    )

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
