import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitBatchOp, GitBatchProgress } from '../../../../shared/git-batch'
import { GIT_BATCH_PHASE_LABELS } from '../../../../shared/git-batch'
import { GitBatchContext, IDLE, RESULT_HOLD_MS, useGitBatch } from './git-batch-context'
import type { BatchState } from './git-batch-context'

/**
 * The state behind the git bar's batch operations — Pull all, Magic sync, and
 * the refresh sweep — and the row that draws it.
 *
 * One state for both, held ABOVE the two buttons, because the progress row is
 * not inside either of them: it is a full-width line under the whole bar, and a
 * button cannot render a sibling of the bar it sits in. Keeping the run state
 * per button is also what made the old version unreadable — each button knew
 * only its own current step word and nothing about how far along the batch was.
 */

export function GitBatchProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<BatchState>(IDLE)
  // A ref, not the state, guards re-entry: two clicks in the same tick would
  // both read the old state and both start a batch.
  const runningRef = useRef(false)

  // Subscribed for the life of the panel rather than per run: a listener
  // attached inside the click handler can miss the first events of a batch that
  // starts reporting before React has re-rendered.
  useEffect(() => {
    return window.electronAPI.onGitBatchProgress((progress: GitBatchProgress) => {
      setState((s) =>
        s.running && s.op === progress.op
          ? {
              ...s,
              phase: progress.phase,
              done: progress.done,
              total: progress.total,
              repoName: progress.repoName
            }
          : s
      )
    })
  }, [])

  // Clear the summary after its hold. Keyed on the message so a second batch
  // finishing restarts the timer instead of inheriting the first one's.
  useEffect(() => {
    if (!state.resultMessage) return
    const timer = setTimeout(() => setState((s) => ({ ...s, resultMessage: null })), RESULT_HOLD_MS)
    return () => clearTimeout(timer)
  }, [state.resultMessage])

  const run = useCallback(async (op: GitBatchOp, task: () => Promise<string>) => {
    if (runningRef.current) return
    runningRef.current = true
    setState({ ...IDLE, running: true, op, phase: 'checking' })
    try {
      const summary = await task()
      setState((s) => ({
        ...s,
        running: false,
        phase: null,
        // Land the bar full: the batch is over, whatever the counter last saw.
        done: s.total > 0 ? s.total : s.done,
        resultMessage: summary
      }))
    } catch (err) {
      console.error(`[git-batch:${op}]`, err)
      setState((s) => ({
        ...s,
        running: false,
        phase: null,
        resultMessage:
          op === 'pull' ? 'Pull failed' : op === 'fetch' ? 'Refresh failed' : 'Sync failed'
      }))
    } finally {
      runningRef.current = false
    }
  }, [])

  return <GitBatchContext.Provider value={{ state, run }}>{children}</GitBatchContext.Provider>
}

/**
 * The progress row: a track that fills left to right with `X/N` at its end.
 *
 * It is a full-width item of the `.panel-bar`, which already wraps — so it
 * lands on its own line under the controls without any of them moving. It
 * exists only while something is running or a summary is being held; the bar
 * is back to one line the rest of the time.
 */
export function GitBatchProgressBar(): React.JSX.Element | null {
  const { state } = useGitBatch()
  if (!state.running && !state.resultMessage) return null

  // Before the first event there is no denominator — an empty track with a
  // count of 0/0 would read as stuck, so the track shimmers instead.
  const indeterminate = state.running && state.total === 0
  const fraction = state.total > 0 ? Math.min(state.done / state.total, 1) : 0
  const phaseLabel = state.phase ? GIT_BATCH_PHASE_LABELS[state.phase] : null

  return (
    <div
      className="panel-bar-progress"
      role="progressbar"
      aria-label={
        state.op === 'sync'
          ? 'Magic sync progress'
          : state.op === 'fetch'
            ? 'Refresh progress'
            : 'Pull all progress'
      }
      aria-valuemin={0}
      aria-valuemax={state.total || undefined}
      aria-valuenow={indeterminate ? undefined : state.done}
      aria-valuetext={
        state.resultMessage ?? `${phaseLabel ?? 'Working'} — ${state.done} of ${state.total}`
      }
      data-op={state.op ?? undefined}
      data-phase={state.phase ?? undefined}
    >
      <span className={`panel-progress-track${indeterminate ? ' is-indeterminate' : ''}`}>
        <span
          className="panel-progress-fill"
          style={indeterminate ? undefined : { width: `${fraction * 100}%` }}
        />
      </span>
      <span className="panel-progress-count">
        {state.resultMessage ?? (indeterminate ? phaseLabel : `${state.done}/${state.total}`)}
      </span>
    </div>
  )
}
