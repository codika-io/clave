import { ipcMain } from 'electron'
import { captureMessage, captureTabSpawn } from '../exchange-capture/service'
import type { MessageCapturePayload, TabSpawnCapturePayload } from '../exchange-capture/types'

/** Capture IPC: fire-and-forget (`send`, not `invoke`) — capture is
 *  observability and must never delay or fail the delivery it records. */
export function registerExchangeHandlers(): void {
  ipcMain.on('exchange:capture-message', (_event, payload: MessageCapturePayload) => {
    captureMessage(payload)
  })
  ipcMain.on('exchange:capture-tab-spawn', (_event, payload: TabSpawnCapturePayload) => {
    captureTabSpawn(payload)
  })
}
