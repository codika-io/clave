import { useEffect, useCallback } from 'react'
import { useRemoteFileTree, type FlatRemoteTreeNode } from '../../hooks/use-remote-file-tree'
import { useSessionStore } from '../../store/session-store'
import { FileIcon } from './file-icons'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

interface RemoteFileTreeProps {
  locationId: string
  cwd: string
}

export function RemoteFileTree({ locationId, cwd }: RemoteFileTreeProps) {
  const { flatNodes, loaded, error, loadRoot, refresh, toggleExpand } = useRemoteFileTree(locationId, cwd)
  const setPreviewFile = useSessionStore((s) => s.setPreviewFile)

  useEffect(() => {
    if (!loaded) loadRoot()
  }, [loaded, loadRoot])

  const handleFileClick = useCallback(
    async (node: FlatRemoteTreeNode) => {
      if (node.type === 'directory') {
        toggleExpand(node.path)
        return
      }
      // Store in preview — reuse existing preview system
      setPreviewFile(node.path, 'tree', cwd, locationId)
    },
    [locationId, cwd, toggleExpand, setPreviewFile]
  )

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center px-3">
        <span className="text-xs text-red-400 text-center">{error}</span>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-text-tertiary">Loading...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Refresh header */}
      <div className="flex items-center justify-end px-2 py-1 flex-shrink-0">
        <button
          onClick={refresh}
          className="btn-icon btn-icon-sm"
          title="Refresh"
        >
          <ArrowPathIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto px-1">
        {flatNodes.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-tertiary">
            Empty directory
          </div>
        ) : (
          flatNodes.map((node) => (
            <RemoteFileTreeRow
              key={node.path}
              node={node}
              onClick={handleFileClick}
            />
          ))
        )}
      </div>
    </div>
  )
}

function RemoteFileTreeRow({
  node,
  onClick
}: {
  node: FlatRemoteTreeNode
  onClick: (node: FlatRemoteTreeNode) => void
}) {
  return (
    <button
      onClick={() => onClick(node)}
      className="w-full flex items-center gap-1.5 py-0.5 pr-2 rounded hover:bg-surface-100 transition-colors text-left"
      style={{ paddingLeft: `${node.depth * 8 + 8}px` }}
    >
      {node.type === 'directory' && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`flex-shrink-0 text-[color:var(--sidebar-icon-color)] transition-transform ${node.expanded ? 'rotate-90' : ''}`}
        >
          <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {node.type === 'file' && <span className="w-2.5 flex-shrink-0" />}
      <FileIcon name={node.name} isDirectory={node.type === 'directory'} isOpen={node.expanded} className="text-[color:var(--sidebar-icon-color)]" />
      <span className="text-[12px] font-medium text-[color:var(--sidebar-item-text)] truncate">
        {node.name}
      </span>
      {node.loading && (
        <span className="text-[10px] text-text-tertiary ml-auto">...</span>
      )}
    </button>
  )
}
