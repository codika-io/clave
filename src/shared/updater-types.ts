/**
 * The updater contract, shared by main, preload and renderer.
 *
 * It lives here because the state has to be pull-able from the renderer, and a
 * pull needs a shape both sides agree on. Before this existed the renderer
 * rebuilt its own idea of the updater out of four separate push events; if it
 * missed the one that mattered — because it had not mounted yet, because it
 * reloaded, or because the check errored and the error was swallowed — there
 * was no way to ask what the truth was.
 */

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

/** One release's notes: the version it belongs to, and its body as Markdown. */
export interface ReleaseNote {
  version: string
  /** The release body, Markdown. Empty bodies are dropped before this point. */
  note: string
}

export interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdaterState {
  /** False in dev and anywhere else electron-updater cannot run. */
  supported: boolean
  phase: UpdatePhase
  currentVersion: string
  /** The version on the server once a check has found one. */
  availableVersion: string | null
  /**
   * What the available version changes, as Markdown, straight from the GitHub
   * release bodies — the ONLY changelog a running app can have for a version it
   * has not installed. `help/whats-new.json` is stamped and bundled at build
   * time, so v1.79 ships no note for v1.80; that note exists only inside the
   * v1.80 binary. This field is how "what's in the update" can be read BEFORE
   * taking it.
   *
   * With `fullChangelog` on, it is every release between the running version
   * and the latest, newest first — a user three versions behind sees all three.
   * Null when no check has found an update, or when the provider gave no body.
   */
  releaseNotes: ReleaseNote[] | null
  progress: DownloadProgress
  /** Set only in the `error` phase — a download that failed. */
  errorMessage: string | null
  /**
   * A *check* that failed, which is not the same thing and must not take over
   * the screen: the app is still perfectly usable, it just does not know
   * whether it is current.
   */
  checkErrorMessage: string | null
  /** Epoch ms of the last completed check, successful or not. */
  lastCheckedAt: number | null
}
