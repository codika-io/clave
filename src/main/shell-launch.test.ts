import { describe, expect, it } from 'vitest'
import { resolvePosixShellLaunch } from './shell-launch'

describe('resolvePosixShellLaunch', () => {
  it.each(['/opt/homebrew/bin/nu', '/opt/homebrew/bin/fish'])(
    'opens a plain terminal with the user shell %s',
    (userShell) => {
      expect(resolvePosixShellLaunch(userShell, undefined, 'darwin')).toEqual({
        file: userShell,
        args: ['-l']
      })
    }
  )

  it.each(['/opt/homebrew/bin/nu', '/opt/homebrew/bin/fish'])(
    'keeps the POSIX agent wrapper away from the user shell %s',
    (userShell) => {
      expect(resolvePosixShellLaunch(userShell, 'agent command', 'darwin')).toEqual({
        file: '/bin/zsh',
        args: ['-l', '-c', 'agent command']
      })
    }
  )

  it('uses the portable command shell outside macOS', () => {
    expect(resolvePosixShellLaunch('/usr/bin/nu', 'agent command', 'linux')).toEqual({
      file: '/bin/sh',
      args: ['-c', 'agent command']
    })
  })
})
