import { ipcMain, Notification, BrowserWindow, app } from 'electron'

export function initNotificationManager(): void {
  ipcMain.handle(
    'notification:show',
    (event, options: { title: string; body: string; sessionId: string }) => {
      if (!Notification.isSupported()) {
        console.log('[notification] Notifications not supported on this system')
        return
      }

      const win = BrowserWindow.fromWebContents(event.sender)
      if (win?.isFocused()) {
        console.log('[notification] Skipped (window is focused):', options.body)
        return
      }

      console.log('[notification] Showing:', options.title, '-', options.body)

      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: false
      })

      notification.on('click', () => {
        if (win) {
          win.show()
          win.focus()
        }
        event.sender.send('notification:clicked', options.sessionId)
      })

      notification.show()
      app.dock?.bounce('informational')
    }
  )
}
