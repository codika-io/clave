import { ipcMain } from 'electron'
import { cancelSearch, listHistory, searchHistory, stampHistory } from '../session-history/service'

/** Session-history IPC (PRDCT-1738). `history:stamp` is fire-and-forget
 *  (`send`, not `invoke`): the renderer writes a ledger row whenever a tab's
 *  placement changes and must never wait on, or fail because of, the disk.
 *  `history:list` is the dialog's one read. `history:search` streams hits
 *  back to the ASKING window (`history:search-hits`) and resolves with the
 *  totals; `history:search-cancel` aborts between lines. */
export function registerHistoryHandlers(): void {
  ipcMain.on('history:stamp', (_event, row: unknown) => {
    stampHistory(row)
  })
  ipcMain.handle('history:list', (_event, options?: { all?: unknown }) =>
    listHistory({ all: options?.all === true })
  )
  ipcMain.handle('history:search', (event, request: unknown) =>
    searchHistory(request, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('history:search-hits', progress)
    })
  )
  ipcMain.on('history:search-cancel', (_event, requestId: unknown) => {
    if (typeof requestId === 'string') cancelSearch(requestId)
  })
}
