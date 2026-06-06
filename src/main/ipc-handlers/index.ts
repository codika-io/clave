import { registerAppHandlers } from './app-handlers'
import { registerBoardHandlers } from './board-handlers'
import { registerUsageHandlers } from './usage-handlers'
import { registerGitHandlers } from './git-handlers'
import { registerUpdaterHandlers } from './updater-handlers'
import { registerFsHandlers } from './fs-handlers'
import { registerPtyHandlers } from './pty-handlers'
import { registerShellHandlers } from './shell-handlers'
import { registerLocationHandlers } from './location-handlers'
import { registerSshHandlers } from './ssh-handlers'
import { registerAgentHandlers } from './agent-handlers'
import { registerClaveFileHandlers } from './clave-file-handlers'
import { registerSessionExportHandlers } from './session-export-handlers'
import { registerDroppedFileHandlers } from './dropped-file-handlers'
import { registerSidebarLayoutHandlers } from './sidebar-layout-handlers'

export function registerIpcHandlers(): void {
  registerAppHandlers()
  registerBoardHandlers()
  registerUsageHandlers()
  registerGitHandlers()
  registerUpdaterHandlers()
  registerFsHandlers()
  registerPtyHandlers()
  registerShellHandlers()
  registerLocationHandlers()
  registerSshHandlers()
  registerAgentHandlers()
  registerClaveFileHandlers()
  registerSessionExportHandlers()
  registerDroppedFileHandlers()
  registerSidebarLayoutHandlers()
}
