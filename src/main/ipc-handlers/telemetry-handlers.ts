import { ipcMain } from 'electron'
import {
  getTelemetryState,
  setTelemetryEnabled,
  resetInstallId,
  setTelemetryNoticeShown
} from '../telemetry'

export function registerTelemetryHandlers(): void {
  ipcMain.handle('telemetry:get-state', () => getTelemetryState())
  ipcMain.handle('telemetry:set-enabled', (_event, enabled: boolean) =>
    setTelemetryEnabled(enabled === true)
  )
  ipcMain.handle('telemetry:reset-id', () => resetInstallId())
  ipcMain.handle('telemetry:set-notice-shown', () => setTelemetryNoticeShown())
}
