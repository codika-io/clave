export interface ShellLaunch {
  file: string
  args: string[]
}

/**
 * Keep the user's shell for interactive terminal tabs, where its own language
 * and configuration belong. Agent launches use a shell Clave controls because
 * their wrapper is POSIX syntax and must not be parsed by Nushell, Fish, or any
 * other user-selected shell.
 */
export function resolvePosixShellLaunch(
  userShell: string,
  command?: string,
  platform: NodeJS.Platform = process.platform
): ShellLaunch {
  if (command === undefined) return { file: userShell, args: ['-l'] }

  return platform === 'darwin'
    ? { file: '/bin/zsh', args: ['-l', '-c', command] }
    : { file: '/bin/sh', args: ['-c', command] }
}
