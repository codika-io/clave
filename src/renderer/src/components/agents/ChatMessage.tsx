import { MarkdownRenderer } from '../files/MarkdownRenderer'
import type { ChatMessage as ChatMessageType } from '../../../../shared/remote-types'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="badge bg-surface-100 text-text-tertiary px-3 py-1">
          {message.content}
        </span>
      </div>
    )
  }

  // User: compact rounded bubble, right-aligned. Assistant: no box, plain text full width.
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-surface-100 px-4 py-2.5 text-sm text-text-primary">
          <p className="whitespace-pre-wrap">{message.content}</p>
          {message.status === 'error' && (
            <span className="text-xs text-red-400 mt-1 block">Failed to send</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="text-sm text-text-primary">
      <div className="prose-sm">
        <MarkdownRenderer content={message.content} />
      </div>
      {message.status === 'streaming' && (
        <span className="inline-block w-1.5 h-4 bg-current opacity-60 animate-pulse ml-0.5 align-text-bottom" />
      )}
      {message.status === 'error' && (
        <span className="text-xs text-red-400 mt-1 block">Failed to send</span>
      )}
    </div>
  )
}
