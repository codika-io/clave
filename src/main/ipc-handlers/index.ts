import { registerAppHandlers } from './app-handlers'
import { registerBoardHandlers } from './board-handlers'
import { registerTemplateHandlers } from './template-handlers'
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
import { registerClaudeHistoryHandlers } from './claude-history-handlers'
import { registerSessionExportHandlers } from './session-export-handlers'
import { registerJournalHandlers } from './journal-handlers'

export function registerIpcHandlers(): void {
  registerAppHandlers()
  registerBoardHandlers()
  registerTemplateHandlers()
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
  registerClaudeHistoryHandlers()
  registerSessionExportHandlers()
  registerJournalHandlers()
}
