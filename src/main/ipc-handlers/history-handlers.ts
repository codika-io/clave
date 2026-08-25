import { ipcMain } from 'electron'
import { listHistory, stampHistory } from '../session-history/service'

/** Session-history IPC (PRDCT-1738). `history:stamp` is fire-and-forget
 *  (`send`, not `invoke`): the renderer writes a ledger row whenever a tab's
 *  placement changes and must never wait on, or fail because of, the disk.
 *  `history:list` is the dialog's one read. */
export function registerHistoryHandlers(): void {
  ipcMain.on('history:stamp', (_event, row: unknown) => {
    stampHistory(row)
  })
  ipcMain.handle('history:list', () => listHistory())
}
