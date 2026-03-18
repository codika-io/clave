import { ipcMain } from 'electron'
import { sshManager } from '../ssh-manager'
import { locationManager } from '../location-manager'
import { getMainWindow } from '../window-utils'

export function registerSshHandlers(): void {
  ipcMain.handle('ssh:connect', async (_event, locationId: string) => {
    const config = locationManager.getCredentials(locationId)
    if (!config) throw new Error('No credentials for location')
    await sshManager.connect(locationId, config)
    locationManager.setLocationStatus(locationId, 'connected')
  })

  ipcMain.handle('ssh:disconnect', (_event, locationId: string) => {
    sshManager.disconnect(locationId)
    locationManager.setLocationStatus(locationId, 'disconnected')
  })

  ipcMain.handle('ssh:exec', async (_event, locationId: string, command: string) => {
    return sshManager.exec(locationId, command)
  })

  ipcMain.handle('ssh:open-shell', async (_event, locationId: string, cwd?: string) => {
    const { shellId, channel } = await sshManager.openShell(locationId, cwd)

    // Forward shell data to renderer
    channel.on('data', (data: Buffer) => {
      getMainWindow()?.webContents.send(`ssh:shell-data:${shellId}`, data.toString('utf-8'))
    })

    channel.on('close', () => {
      getMainWindow()?.webContents.send(`ssh:shell-exit:${shellId}`, 0)
    })

    return shellId
  })

  ipcMain.on('ssh:shell-write', (_event, shellId: string, data: string) => {
    const channel = sshManager.getShell(shellId)
    channel?.write(data)
  })

  ipcMain.on('ssh:shell-resize', (_event, shellId: string, cols: number, rows: number) => {
    const channel = sshManager.getShell(shellId)
    channel?.setWindow(rows, cols, 0, 0)
  })

  ipcMain.handle('ssh:shell-close', (_event, shellId: string) => {
    sshManager.closeShell(shellId)
  })

  // SFTP handlers
  ipcMain.handle('sftp:read-dir', async (_event, locationId: string, dirPath: string) => {
    const sftp = await sshManager.getSftp(locationId)
    return new Promise((resolve, reject) => {
      sftp.readdir(dirPath, (err, list) => {
        if (err) return reject(err)
        resolve(list.map((item) => ({
          name: item.filename,
          path: dirPath === '/' ? `/${item.filename}` : `${dirPath}/${item.filename}`,
          type: item.attrs.isDirectory() ? 'directory' as const : 'file' as const,
          size: item.attrs.size
        })))
      })
    })
  })

  ipcMain.handle('sftp:read-file', async (_event, locationId: string, filePath: string) => {
    const sftp = await sshManager.getSftp(locationId)
    return new Promise<string>((resolve, reject) => {
      let data = ''
      const stream = sftp.createReadStream(filePath, { encoding: 'utf-8' })
      stream.on('data', (chunk: string) => { data += chunk })
      stream.on('end', () => resolve(data))
      stream.on('error', reject)
    })
  })

  ipcMain.handle('sftp:stat', async (_event, locationId: string, filePath: string) => {
    const sftp = await sshManager.getSftp(locationId)
    return new Promise((resolve, reject) => {
      sftp.stat(filePath, (err, stats) => {
        if (err) return reject(err)
        resolve({
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          size: stats.size,
          mtime: stats.mtime
        })
      })
    })
  })

  // SSH connection lifecycle — forward close/error to renderer
  sshManager.onClose((locationId) => {
    getMainWindow()?.webContents.send('ssh:connection-closed', locationId)
    locationManager.setLocationStatus(locationId, 'disconnected')
  })

  sshManager.onError((locationId) => {
    getMainWindow()?.webContents.send('ssh:connection-closed', locationId)
    locationManager.setLocationStatus(locationId, 'error')
  })
}
