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
] as const

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
