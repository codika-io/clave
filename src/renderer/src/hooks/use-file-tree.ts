import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { DirEntry } from '../../../preload/index.d'

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: TreeNode[]
  expanded: boolean
  loading: boolean
  depth: number
}

export interface FlatTreeNode extends TreeNode {
  depth: number
}

function flattenTree(nodes: TreeNode[], depth = 0): FlatTreeNode[] {
  const result: FlatTreeNode[] = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    if (node.type === 'directory' && node.expanded && node.children) {
      result.push(...flattenTree(node.children, depth + 1))
    }
  }
  return result
}

export function useFileTree(cwd: string | null) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
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

        // Auto-expand previously expanded dirs
        for (const node of nodes) {
          if (node.type === 'directory' && expanded.has(node.path)) {
            loadChildren(cwd, node.path, nodes)
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

  const loadChildren = useCallback(
    async (
      rootCwd: string,
      dirPath: string,
      currentNodes?: TreeNode[]
    ) => {
      try {
        const entries = await window.electronAPI?.readDir(rootCwd, dirPath)
        if (!entries) return

        const children: TreeNode[] = entries.map((e: DirEntry) => ({
          name: e.name,
          path: e.path,
          type: e.type,
          size: e.size,
          expanded: false,
          loading: false,
          depth: 0
        }))

        setRootNodes((prev) => {
          const nodes = currentNodes ?? prev
          return updateNodeChildren(nodes, dirPath, children)
        })
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

  const flatList = useMemo(() => {
    let nodes = flattenTree(rootNodes)
    if (filter) {
      const lowerFilter = filter.toLowerCase()
      nodes = nodes.filter((n) => n.name.toLowerCase().includes(lowerFilter))
    }
    return nodes
  }, [rootNodes, filter])

  return { rootNodes, flatList, loading, filter, setFilter, toggleDir }
}

// Helper functions to update tree immutably

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}

function updateNodeChildren(
  nodes: TreeNode[],
  path: string,
  children: TreeNode[]
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, children, loading: false }
    }
    if (node.children) {
      return { ...node, children: updateNodeChildren(node.children, path, children) }
    }
    return node
  })
}

function toggleNodeExpanded(nodes: TreeNode[], path: string): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, expanded: !node.expanded }
    }
    if (node.children) {
      return { ...node, children: toggleNodeExpanded(node.children, path) }
    }
    return node
  })
}

function setNodeLoading(nodes: TreeNode[], path: string, loading: boolean): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, loading }
    }
    if (node.children) {
      return { ...node, children: setNodeLoading(node.children, path, loading) }
    }
    return node
  })
}
