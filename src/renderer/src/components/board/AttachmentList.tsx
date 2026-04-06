import { useState, useCallback, useEffect } from 'react'
import { PaperClipIcon, XMarkIcon, PhotoIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import type { TaskAttachment } from '../../../../preload/index.d'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

interface AttachmentListProps {
  attachments: TaskAttachment[]
  onChange: (attachments: TaskAttachment[]) => void
}

export function AttachmentList({ attachments, onChange }: AttachmentListProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [isDragOver, setIsDragOver] = useState(false)

  // Load thumbnails for image attachments
  useEffect(() => {
    let cancelled = false
    const imageAttachments = attachments.filter((a) => isImageFile(a.name))
    const missing = imageAttachments.filter((a) => !thumbnails[a.id])

    if (missing.length === 0) return

    Promise.all(
      missing.map(async (a) => {
        const dataUrl = await window.electronAPI?.readImageAsDataUrl(a.path)
        return { id: a.id, dataUrl }
      })
    ).then((results) => {
      if (cancelled) return
      setThumbnails((prev) => {
        const next = { ...prev }
        for (const r of results) {
          if (r.dataUrl) next[r.id] = r.dataUrl
        }
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [attachments, thumbnails])

  const handleAddFiles = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const paths = await window.electronAPI?.openFileDialog()
    if (!paths) return

    const newAttachments: TaskAttachment[] = paths
      .filter((p) => !attachments.some((a) => a.path === p))
      .map((p) => ({
        id: crypto.randomUUID(),
        path: p,
        name: basename(p)
      }))

    if (newAttachments.length > 0) {
      onChange([...attachments, ...newAttachments])
    }
  }, [attachments, onChange])

  const handleRemove = useCallback(
    (id: string) => {
      onChange(attachments.filter((a) => a.id !== id))
      setThumbnails((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    },
    [attachments, onChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      const newAttachments: TaskAttachment[] = files
        .map((f) => {
          const path = window.electronAPI?.getPathForFile(f)
          if (!path) return null
          if (attachments.some((a) => a.path === path)) return null
          return {
            id: crypto.randomUUID() as string,
            path,
            name: f.name
          }
        })
        .filter((a): a is TaskAttachment => a !== null)

      if (newAttachments.length > 0) {
        onChange([...attachments, ...newAttachments])
      }
    },
    [attachments, onChange]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <label className="block text-xs font-medium text-text-secondary mb-1">
        Attachments
      </label>

      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-200 group/attachment"
            >
              {isImageFile(a.name) ? (
                thumbnails[a.id] ? (
                  <img
                    src={thumbnails[a.id]}
                    alt={a.name}
                    className="w-6 h-6 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <PhotoIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                )
              ) : (
                <DocumentTextIcon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
              )}
              <span className="text-xs text-text-primary truncate flex-1" title={a.path}>
                {a.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(a.id)
                }}
                className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover/attachment:opacity-100 hover:bg-surface-300 text-text-tertiary hover:text-text-primary transition-all flex-shrink-0"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / add button */}
      <div
        className={`flex items-center justify-center gap-1.5 h-8 rounded-lg border border-dashed text-xs transition-colors cursor-pointer ${
          isDragOver
            ? 'border-accent bg-accent/5 text-accent'
            : 'border-border-subtle text-text-tertiary hover:border-border hover:text-text-secondary'
        }`}
        onClick={handleAddFiles}
      >
        <PaperClipIcon className="w-3.5 h-3.5" />
        {isDragOver ? 'Drop files here' : 'Add files or drop here'}
      </div>
    </div>
  )
}
