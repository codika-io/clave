import { useState, useRef, useCallback, useEffect } from 'react'
import { useBoardStore } from '../../store/board-store'
import { TagPill } from './TagPill'
import { cn } from '../../lib/utils'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const boardTags = useBoardStore((s) => s.tags)
  const addTag = useBoardStore((s) => s.addTag)

  const [input, setInput] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const normalized = input.trim().toLowerCase().replace(/^#/, '')

  const suggestions = boardTags.filter(
    (t) => t.name.includes(normalized) && !tags.includes(t.name)
  )

  const showCreate = normalized && !boardTags.some((t) => t.name === normalized) && !tags.includes(normalized)
  const totalOptions = suggestions.length + (showCreate ? 1 : 0)

  useEffect(() => {
    setHighlightIdx(0)
  }, [input])

  const addTagToTask = useCallback(
    (name: string) => {
      const norm = name.trim().toLowerCase().replace(/^#/, '')
      if (!norm) return
      if (tags.includes(norm)) return

      // Ensure tag definition exists at board level
      if (!boardTags.some((t) => t.name === norm)) {
        addTag(norm)
      }

      onChange([...tags, norm])
      setInput('')
      setShowDropdown(false)
      inputRef.current?.focus()
    },
    [tags, boardTags, addTag, onChange]
  )

  const removeTagFromTask = useCallback(
    (name: string) => {
      onChange(tags.filter((t) => t !== name))
    },
    [tags, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (totalOptions > 0 && showDropdown) {
          if (highlightIdx < suggestions.length) {
            addTagToTask(suggestions[highlightIdx].name)
          } else if (showCreate) {
            addTagToTask(normalized)
          }
        } else if (normalized) {
          addTagToTask(normalized)
        }
      } else if (e.key === 'Backspace' && !input && tags.length > 0) {
        removeTagFromTask(tags[tags.length - 1])
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((i) => Math.min(i + 1, totalOptions - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Escape') {
        setShowDropdown(false)
      }
    },
    [input, tags, normalized, suggestions, showCreate, highlightIdx, totalOptions, addTagToTask, removeTagFromTask, showDropdown]
  )

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const getTagColor = (name: string): string => {
    return boardTags.find((t) => t.name === name)?.color ?? 'blue'
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-lg bg-surface-200 min-h-[32px]">
        {tags.map((tag) => (
          <TagPill
            key={tag}
            name={tag}
            color={getTagColor(tag)}
            size="md"
            onRemove={() => removeTagFromTask(tag)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? 'Add tags...' : ''}
          className="flex-1 min-w-[60px] bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && totalOptions > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg bg-surface-100 border border-border shadow-lg overflow-hidden">
          {suggestions.map((tag, idx) => (
            <button
              key={tag.name}
              onClick={() => addTagToTask(tag.name)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-surface-200 transition-colors text-left',
                idx === highlightIdx && 'bg-surface-200'
              )}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: getComputedDotColor(tag.color) }}
              />
              {tag.name}
            </button>
          ))}
          {showCreate && (
            <button
              onClick={() => addTagToTask(normalized)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-200 transition-colors text-left',
                highlightIdx === suggestions.length && 'bg-surface-200'
              )}
            >
              Create &ldquo;<span className="text-text-primary">{normalized}</span>&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function getComputedDotColor(colorId: string): string {
  const colorMap: Record<string, string> = {
    blue: '#60a5fa', green: '#4ade80', amber: '#fbbf24', red: '#f87171',
    purple: '#c084fc', pink: '#f472b6', cyan: '#22d3ee', orange: '#fb923c'
  }
  return colorMap[colorId] ?? '#6b7280'
}
