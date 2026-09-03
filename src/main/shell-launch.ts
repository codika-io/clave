import { basename } from 'node:path'

export interface ShellLaunch {
  file: string
  args: string[]
}

/**
 * Shells whose command language is POSIX sh. They parse Clave's agent wrapper
 * as written, so the user's own shell stays in charge — and with it the
 * profile that sets their PATH order (`path_helper` on macOS reorders PATH on
 * every login; a bash user's `.bash_profile` puts it back, their absent
 * `.zprofile` would not).
 */
const POSIX_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'ash'])

/**
 * Keep the user's shell for interactive terminal tabs, where its own language
 * and configuration belong. Agent launches keep it too when it speaks POSIX;
 * otherwise (Nushell, Fish, xonsh, csh…) the wrapper goes to a shell Clave
 * controls, because their parsers reject it and the agent never starts.
 */
export function resolvePosixShellLaunch(
  userShell: string,
  command?: string,
  platform: NodeJS.Platform = process.platform
): ShellLaunch {
  if (command === undefined) return { file: userShell, args: ['-l'] }

  const file = POSIX_SHELLS.has(basename(userShell))
    ? userShell
    : platform === 'darwin'
      ? '/bin/zsh'
      : '/bin/sh'
  return { file, args: ['-l', '-c', command] }
}
