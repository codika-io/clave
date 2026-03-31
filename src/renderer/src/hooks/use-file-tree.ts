import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { DirEntry } from '../../../preload/index.d'
import {
  flattenTree,
  findNode,
  updateNodeChildren,
  toggleNodeExpanded,
  setNodeLoading,
  type BaseTreeNode
} from '../lib/tree-utils'

export interface TreeNode extends BaseTreeNode {
  children?: TreeNode[]
  ignored?: boolean
}

export interface FlatTreeNode extends TreeNode {
  depth: number
}

/** Mark nodes whose paths appear in the ignored set */
function applyIgnored(nodes: TreeNode[], ignoredSet: Set<string>): TreeNode[] {
  return nodes.map((node) => {
    const ignored = ignoredSet.has(node.path)
    if (node.children) {
      return { ...node, ignored, children: applyIgnored(node.children, ignoredSet) }
    }
    return { ...node, ignored }
  })
}

/** Batch-check which paths are gitignored, then mark them in the tree */
async function enrichWithIgnored(
  rootCwd: string,
  nodes: TreeNode[],
  setRootNodes: React.Dispatch<React.SetStateAction<TreeNode[]>>,
  parentDirPath?: string
): Promise<void> {
  const paths = nodes.map((n) => n.path)
  if (paths.length === 0) return

  const ignoredPaths = await window.electronAPI?.gitCheckIgnored(rootCwd, paths)
  if (!ignoredPaths || ignoredPaths.length === 0) return

  const ignoredSet = new Set(ignoredPaths)

  setRootNodes((prev) => {
    if (parentDirPath) {
      // Enriching children of a specific directory
      return markIgnoredInChildren(prev, parentDirPath, ignoredSet)
    }
    // Enriching root-level nodes
    return applyIgnored(prev, ignoredSet)
  })
}

/** Apply ignored flags to children of a specific parent node */
function markIgnoredInChildren(
  nodes: TreeNode[],
  parentPath: string,
  ignoredSet: Set<string>
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === parentPath && node.children) {
      return { ...node, children: applyIgnored(node.children, ignoredSet) }
    }
    if (node.children) {
      return { ...node, children: markIgnoredInChildren(node.children, parentPath, ignoredSet) }
    }
    return node
  })
}

/** Merge new entries into an existing parent node's children, preserving expansion state */
function mergeNodeChildren(
  nodes: TreeNode[],
  parentPath: string,
  newChildren: TreeNode[]
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === parentPath) {
      if (!node.children) return node // Not expanded — skip
      const existingByPath = new Map(node.children.map((c) => [c.path, c]))
      const merged = newChildren.map((child) => {
        const existing = existingByPath.get(child.path)
        if (existing && existing.type === child.type && child.type === 'directory') {
          return {
            ...child,
            expanded: existing.expanded,
            children: existing.children,
            ignored: existing.ignored,
            loading: existing.loading
          }
        }
        if (existing) {
          return { ...child, ignored: existing.ignored }
        }
        return child
      })
      return { ...node, children: merged }
    }
    if (node.children) {
      return { ...node, children: mergeNodeChildren(node.children, parentPath, newChildren) }
    }
    return node
  })
}

/** Recursively collapse all nodes */
function collapseAllNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'directory') {
      return {
        ...node,
        expanded: false,
        children: node.children ? collapseAllNodes(node.children) : undefined
      }
    }
    return node
  })
}

export function useFileTree(cwd: string | null) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [allFiles, setAllFiles] = useState<string[] | null>(null)
  const expansionCache = useRef(new Map<string, Set<string>>())

  // Load root directory when cwd changes
  useEffect(() => {
    if (!cwd) {
      setRootNodes([])
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async (): Promise<void> => {
      try {
        const entries = await window.electronAPI?.readDir(cwd, '.')
        if (cancelled || !entries) return

        // Restore expansion state
        const expanded = expansionCache.current.get(cwd) ?? new Set<string>()

        const nodes: TreeNode[] = entries.map((e: DirEntry) => ({
          name: e.name,
          path: e.path,
          type: e.type,
          size: e.size,
          expanded: expanded.has(e.path),
          loading: false,
          depth: 0,
          children: e.type === 'directory' ? undefined : undefined
        }))

        setRootNodes(nodes)

        // Check gitignore status (async, non-blocking)
        enrichWithIgnored(cwd, nodes, setRootNodes)

        // Auto-expand previously expanded dirs
        for (const node of nodes) {
          if (node.type === 'directory' && expanded.has(node.path)) {
            loadChildren(cwd, node.path)
          }
        }
      } catch (err) {
        console.error('Failed to load directory:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd])

  // Load full recursive file list when filter is active
  const hasFilter = filter.length > 0
  useEffect(() => {
    if (!cwd || !hasFilter) {
      setAllFiles(null)
      return
    }

    let cancelled = false
    window.electronAPI?.listFiles(cwd).then((result) => {
      if (cancelled || !result) return
      setAllFiles(result.files)
    })

    return () => { cancelled = true }
  }, [cwd, hasFilter])

  // Watch for file system changes and merge updates into the tree
  useEffect(() => {
    if (!cwd) return

    window.electronAPI?.watchDir(cwd)

    const unsub = window.electronAPI?.onFsChanged((changedCwd, changedDirs) => {
      if (changedCwd !== cwd) return

      for (const dir of changedDirs) {
        window.electronAPI
          ?.readDir(cwd, dir === '.' ? '.' : dir)
          .then((entries) => {
            if (!entries) return

            const newChildren: TreeNode[] = entries.map((e: DirEntry) => ({
              name: e.name,
              path: e.path,
              type: e.type,
              size: e.size,
              expanded: false,
              loading: false,
              depth: 0
            }))

            if (dir === '.') {
              // Merge root nodes, preserving expanded directories
              setRootNodes((prev) => {
                const prevByPath = new Map(prev.map((n) => [n.path, n]))
                return newChildren.map((child) => {
                  const existing = prevByPath.get(child.path)
                  if (existing && existing.type === child.type && child.type === 'directory') {
                    return {
                      ...child,
                      expanded: existing.expanded,
                      children: existing.children,
                      ignored: existing.ignored,
                      loading: existing.loading
                    }
                  }
                  if (existing) {
                    return { ...child, ignored: existing.ignored }
                  }
                  return child
                })
              })
            } else {
              setRootNodes((prev) => mergeNodeChildren(prev, dir, newChildren))
            }

            // Enrich gitignore status for new entries
            enrichWithIgnored(cwd, newChildren, setRootNodes, dir === '.' ? undefined : dir)
          })
          .catch(() => {
            // Directory may have been deleted — ignore
          })
      }
    })

    return () => {
      window.electronAPI?.unwatchDir()
      unsub?.()
    }
  }, [cwd])

  const loadChildren = useCallback(
    async (
      rootCwd: string,
      dirPath: string,
      currentNodes?: TreeNode[]
    ) => {
      try {
        const entries = await window.electronAPI?.readDir(rootCwd, dirPath)
        if (!entries) return

        // Check expansion cache to restore expanded state for deeper levels
        const expanded = expansionCache.current.get(rootCwd) ?? new Set<string>()

        const children: TreeNode[] = entries.map((e: DirEntry) => ({
          name: e.name,
          path: e.path,
          type: e.type,
          size: e.size,
          expanded: e.type === 'directory' && expanded.has(e.path),
          loading: false,
          depth: 0
        }))

        setRootNodes((prev) => {
          const nodes = currentNodes ?? prev
          return updateNodeChildren(nodes, dirPath, children)
        })

        // Check gitignore status for children (async, non-blocking)
        enrichWithIgnored(rootCwd, children, setRootNodes, dirPath)

        // Recursively load children for subdirectories that were previously expanded
        for (const child of children) {
          if (child.type === 'directory' && expanded.has(child.path)) {
            loadChildren(rootCwd, child.path)
          }
        }
      } catch (err) {
        console.error('Failed to load children:', err)
      }
    },
    []
  )

  const toggleDir = useCallback(
    async (dirPath: string) => {
      if (!cwd) return

      setRootNodes((prev) => {
        const node = findNode(prev, dirPath)
        if (!node) return prev

        const willExpand = !node.expanded

        // Update expansion cache
        const cached = expansionCache.current.get(cwd) ?? new Set<string>()
        if (willExpand) {
          cached.add(dirPath)
        } else {
          cached.delete(dirPath)
        }
        expansionCache.current.set(cwd, cached)

        // If expanding and no children loaded yet, mark loading
        if (willExpand && !node.children) {
          const updated = toggleNodeExpanded(prev, dirPath)
          return setNodeLoading(updated, dirPath, true)
        }

        return toggleNodeExpanded(prev, dirPath)
      })

      // Load children if needed
      const node = findNode(rootNodes, dirPath)
      if (node && !node.expanded && !node.children) {
        await loadChildren(cwd, dirPath)
        setRootNodes((prev) => setNodeLoading(prev, dirPath, false))
      }
    },
    [cwd, rootNodes, loadChildren]
  )

  const refreshDir = useCallback(
    async (dirPath: string) => {
      if (!cwd) return
      // Reload children of the given directory (or root if '.')
      if (dirPath === '.') {
        const entries = await window.electronAPI?.readDir(cwd, '.')
        if (!entries) return
        const expanded = expansionCache.current.get(cwd) ?? new Set<string>()
        const nodes: TreeNode[] = entries.map((e: DirEntry) => ({
          name: e.name,
          path: e.path,
          type: e.type,
          size: e.size,
          expanded: expanded.has(e.path),
          loading: false,
          depth: 0
        }))
        setRootNodes(nodes)
        enrichWithIgnored(cwd, nodes, setRootNodes)
        for (const node of nodes) {
          if (node.type === 'directory' && expanded.has(node.path)) {
            loadChildren(cwd, node.path, nodes)
          }
        }
      } else {
        await loadChildren(cwd, dirPath)
      }
    },
    [cwd, loadChildren]
  )

  const collapseAll = useCallback(() => {
    if (!cwd) return
    expansionCache.current.delete(cwd)
    setRootNodes((prev) => collapseAllNodes(prev))
  }, [cwd])

  const flatList = useMemo(() => {
    if (!filter) return flattenTree(rootNodes)

    const lowerFilter = filter.toLowerCase()

    // Use recursive file list when available for deep search
    if (allFiles) {
      return allFiles
        .filter((f) => f.toLowerCase().includes(lowerFilter))
        .slice(0, 200)
        .map((f): FlatTreeNode => {
          const lastSlash = f.lastIndexOf('/')
          return {
            name: lastSlash >= 0 ? f.slice(lastSlash + 1) : f,
            path: f,
            type: 'file',
            expanded: false,
            loading: false,
            depth: 0
          }
        })
    }

    // Fallback: search loaded nodes only
    const matches: FlatTreeNode[] = []
    function collectMatches(nodes: TreeNode[]): void {
      for (const node of nodes) {
        if (node.type === 'file' && node.name.toLowerCase().includes(lowerFilter)) {
          matches.push({ ...node, depth: 0 })
        }
        if (node.children) collectMatches(node.children)
      }
    }
    collectMatches(rootNodes)
    return matches
  }, [rootNodes, filter, allFiles])

  return { rootNodes, flatList, loading, filter, setFilter, toggleDir, refreshDir, collapseAll }
}

