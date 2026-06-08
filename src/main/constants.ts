/** Directories to always exclude from file listings and watchers */
export const IGNORED_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.next',
  '.svelte-kit',
  '.DS_Store',
  'coverage',
  '.cache'
]

/** Set version for fast lookup in file watchers */
export const IGNORED_DIRECTORIES_SET = new Set<string>(IGNORED_DIRECTORIES)

/** Maximum number of files returned by listFiles */
export const MAX_FILES = 50_000

/** Maximum file size (bytes) for readFile before truncation */
export const MAX_FILE_SIZE = 1024 * 1024 // 1 MB

/** Buffer size for binary file detection probe */
export const BINARY_PROBE_SIZE = 8192

/** Default terminal dimensions */
export const DEFAULT_TERMINAL_COLS = 80
export const DEFAULT_TERMINAL_ROWS = 24

/** Delay (ms) before writing an initial command to a new PTY */
export const INITIAL_COMMAND_DELAY_MS = 150

/** Debounce delay (ms) for file system watcher change events */
export const FS_WATCH_DEBOUNCE_MS = 300

// ─── Git repo discovery (RepoIndexManager) ───────────────────────────────────

/**
 * Directory NAMES to skip while discovering git repos. Superset of the file-tree
 * ignore list — these never contain repos worth surfacing and are huge/noisy.
 */
export const DISCOVERY_SKIP_NAMES = new Set<string>([
  ...IGNORED_DIRECTORIES,
  'Library',
  'Applications',
  '.Trash',
  '.npm',
  '.pnpm-store',
  '.gradle',
  '.cargo',
  '.rustup',
  'venv',
  '.venv',
  'vendor',
  'Pods'
])

/**
 * Absolute system paths to never descend into during discovery. Critical when a
 * user opens "/" — these trees are enormous and contain no user repos.
 */
export const DISCOVERY_SKIP_PATHS = new Set<string>([
  '/System',
  '/Library',
  '/private',
  '/usr',
  '/bin',
  '/sbin',
  '/dev',
  '/Volumes',
  '/cores',
  '/opt',
  '/Network',
  '/Applications',
  '/.Spotlight-V100',
  '/.fseventsd',
  '/.DocumentRevisions-V100',
  '/.TemporaryItems',
  '/.vol'
])

/** Max concurrent readdir workers during a discovery scan */
export const DISCOVERY_CONCURRENCY = 8

/** Hard cap on directories visited in a single scan (runaway-tree backstop) */
export const MAX_DISCOVERY_DIRS = 15_000

/** Hard cap on repos returned by a single scan */
export const MAX_DISCOVERY_REPOS = 300

/** How long a completed scan result stays valid before a re-scan (ms) */
export const DISCOVERY_CACHE_TTL_MS = 120_000

/** Max concurrent `git status` calls when refreshing many repos at once */
export const STATUS_BATCH_CONCURRENCY = 6

/** Max concurrent `git fetch` calls when refreshing many repos at once */
export const FETCH_BATCH_CONCURRENCY = 4

/**
 * Above this many discovered repos, the multi-repo panel does a one-shot load and
 * stops auto-polling/fetching — manual refresh only. Keeps huge trees (e.g. "/")
 * from spawning a perpetual status+fetch cascade.
 */
export const MULTI_REPO_LIVE_POLL_MAX = 50
