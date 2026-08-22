/**
 * Spatial repo tree for the multi-repo git panel (PRDCT-1235 / PRDCT-1455).
 *
 * Turns the flat repo list from discovery into the tree the user already has
 * in their head: repos sit under their real parent directories, relative to
 * the panel's folder. Single-child directory chains are compacted into one
 * node ("labs/products" when nothing else branches) so pass-through folders
 * never burn a row — the same idiom compactTree applies to file trees inside
 * a repo (git-file-tree.ts).
 *
 * Pure data — no fs, no path module — so it is unit-testable and shared-safe.
 */

export interface RepoRef {
  name: string
  /** Absolute path of the repo root */
  path: string
}

export interface RepoTreeDir {
  type: 'dir'
  /** Display label — a compacted chain like "labs/products" */
  name: string
  /** Absolute path of the deepest directory in the compacted chain */
  path: string
  children: RepoTreeNode[]
  /** Absolute paths of every repo in this subtree, for badge roll-ups */
  repoPaths: string[]
}

export interface RepoTreeLeaf {
  type: 'repo'
  name: string
  path: string
}

export type RepoTreeNode = RepoTreeDir | RepoTreeLeaf

export interface FlatRepoRow {
  node: RepoTreeNode
  depth: number
  /** Directories only — true when the row is folded */
  collapsed: boolean
}

/**
 * Build the directory tree of `repos` relative to `basePath`.
 * A repo not under basePath (defensive — discovery never returns one) becomes
 * a top-level leaf. Each level sorts alphabetically, directories and repos
 * interleaved, matching Finder.
 */
export function buildRepoTree(basePath: string, repos: RepoRef[]): RepoTreeNode[] {
  const base = basePath === '/' ? '/' : basePath.replace(/\/+$/, '')
  const prefix = base === '/' ? '/' : base + '/'

  const root: RepoTreeDir = { type: 'dir', name: '', path: base, children: [], repoPaths: [] }

  for (const repo of repos) {
    if (!repo.path.startsWith(prefix) || repo.path === base) {
      root.children.push({ type: 'repo', name: repo.name, path: repo.path })
      root.repoPaths.push(repo.path)
      continue
    }
    const segments = repo.path.slice(prefix.length).split('/').filter(Boolean)
    let current = root
    root.repoPaths.push(repo.path)
    // Intermediate segments are directories; the last one is the repo itself.
    for (let i = 0; i < segments.length - 1; i++) {
      const dirPath = current.path === '/' ? '/' + segments[i] : current.path + '/' + segments[i]
      let dir = current.children.find(
        (c): c is RepoTreeDir => c.type === 'dir' && c.path === dirPath
      )
      if (!dir) {
        dir = { type: 'dir', name: segments[i], path: dirPath, children: [], repoPaths: [] }
        current.children.push(dir)
      }
      dir.repoPaths.push(repo.path)
      current = dir
    }
    current.children.push({ type: 'repo', name: repo.name, path: repo.path })
  }

  const compacted = compactRepoTree(root.children)
  sortRepoTree(compacted)
  return compacted
}

/** Merge single-child directory chains into one node ("labs/products"). */
function compactRepoTree(nodes: RepoTreeNode[]): RepoTreeNode[] {
  return nodes.map((node) => {
    if (node.type !== 'dir') return node
    let current = node
    while (current.children.length === 1 && current.children[0].type === 'dir') {
      const child = current.children[0] as RepoTreeDir
      current = {
        type: 'dir',
        name: current.name + '/' + child.name,
        path: child.path,
        children: child.children,
        repoPaths: current.repoPaths
      }
    }
    return { ...current, children: compactRepoTree(current.children) }
  })
}

function sortRepoTree(nodes: RepoTreeNode[]): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name))
  for (const node of nodes) {
    if (node.type === 'dir') sortRepoTree(node.children)
  }
}

/**
 * Flatten for rendering. A directory in `collapsedPaths` keeps its row but
 * its subtree is not descended — its badges roll up instead.
 */
export function flattenRepoTree(
  nodes: RepoTreeNode[],
  collapsedPaths: Set<string>,
  depth = 0
): FlatRepoRow[] {
  const rows: FlatRepoRow[] = []
  for (const node of nodes) {
    const collapsed = node.type === 'dir' && collapsedPaths.has(node.path)
    rows.push({ node, depth, collapsed })
    if (node.type === 'dir' && !collapsed) {
      rows.push(...flattenRepoTree(node.children, collapsedPaths, depth + 1))
    }
  }
  return rows
}

/** Every directory path in the tree — the "collapse all" set. */
export function collectRepoTreeDirPaths(nodes: RepoTreeNode[]): Set<string> {
  const paths = new Set<string>()
  const walk = (ns: RepoTreeNode[]): void => {
    for (const n of ns) {
      if (n.type === 'dir') {
        paths.add(n.path)
        walk(n.children)
      }
    }
  }
  walk(nodes)
  return paths
}
