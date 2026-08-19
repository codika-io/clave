import { ipcMain } from 'electron'
import {
  listOfferViews,
  copyOfferToClipboard,
  dismissOffer,
  dismissSessionOffers
} from '../copy-offer-manager'

export function registerCopyOfferHandlers(): void {
  ipcMain.handle('copy-offer:list', () => listOfferViews())
  ipcMain.handle('copy-offer:copy', (_event, id: string) => copyOfferToClipboard(id))
  ipcMain.handle('copy-offer:dismiss', (_event, id: string) => dismissOffer(id))
  ipcMain.handle('copy-offer:dismiss-session', (_event, sessionId: string) =>
    dismissSessionOffers(sessionId)
  )
}
