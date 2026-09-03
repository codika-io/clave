import { afterEach, describe, expect, it } from 'vitest'
import { resolvePosixShellLaunch } from './shell-launch'

const POSIX = ['/bin/sh', '/bin/bash', '/bin/zsh', '/opt/homebrew/bin/bash', '/usr/bin/dash']
const NON_POSIX = ['/opt/homebrew/bin/nu', '/opt/homebrew/bin/fish', '/usr/bin/xonsh', '/bin/tcsh']

describe('resolvePosixShellLaunch', () => {
  it.each([...POSIX, ...NON_POSIX])('opens a plain terminal with the user shell %s', (userShell) => {
    expect(resolvePosixShellLaunch(userShell, undefined, 'darwin')).toEqual({
      file: userShell,
      args: ['-l']
    })
  })

  it.each(POSIX)('keeps a POSIX user shell %s in charge of the agent wrapper', (userShell) => {
    for (const platform of ['darwin', 'linux'] as const) {
      expect(resolvePosixShellLaunch(userShell, 'agent command', platform)).toEqual({
        file: userShell,
        args: ['-l', '-c', 'agent command']
      })
    }
  })

  it.each(NON_POSIX)('keeps the POSIX agent wrapper away from the user shell %s', (userShell) => {
    expect(resolvePosixShellLaunch(userShell, 'agent command', 'darwin')).toEqual({
      file: '/bin/zsh',
      args: ['-l', '-c', 'agent command']
    })
    expect(resolvePosixShellLaunch(userShell, 'agent command', 'linux')).toEqual({
      file: '/bin/sh',
      args: ['-l', '-c', 'agent command']
    })
  })

  describe('platform default', () => {
    const realPlatform = process.platform
    afterEach(() => Object.defineProperty(process, 'platform', { value: realPlatform }))

    // The production call site passes no platform; a wrong default would
    // pick the mac adapter on Linux and every explicit-platform case above
    // would still be green.
    it('reads process.platform when no platform is given', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(resolvePosixShellLaunch('/usr/bin/nu', 'agent command').file).toBe('/bin/sh')
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(resolvePosixShellLaunch('/usr/bin/nu', 'agent command').file).toBe('/bin/zsh')
    })
  })
})
