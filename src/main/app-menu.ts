import { Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { focusedOrPrimaryWindow } from './window-routing'
import { checkForUpdatesNow, openUpdaterLog, RELEASES_URL } from './auto-updater'

const REPO_URL = 'https://github.com/codika-io/clave'
// electron-builder's productName, stated rather than read: `app.name` is the
// package name ("clave") until the app is packaged, so the menu would say
// "Quit clave" in dev and "Quit Clave" in a release.
const APP_NAME = 'Clave'

/** Bring the window forward and put the user on a Settings pane. */
function openSettingsSection(section: string): void {
  const win = focusedOrPrimaryWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send('menu:open-settings-section', section)
}

/**
 * "Check for Updates…" — the menu bar item every Mac app has and Clave did
 * not.
 *
 * It does two things on purpose: it runs the check, and it takes the user to
 * the Software Update pane so the *result* has somewhere to appear. A check
 * whose answer lands nowhere is what left a user with a new release published,
 * an app that knew about it, and no surface saying so.
 */
async function checkForUpdatesFromMenu(): Promise<void> {
  openSettingsSection('updates')
  await checkForUpdatesNow()
}

/**
 * Clave ran on Electron's default menu, which has no Check for Updates and no
 * Help entries. Replacing it means we now own every standard item too — the
 * Edit roles below are not decoration, they are what keeps ⌘C/⌘V working.
 */
export function buildAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `About ${APP_NAME}` },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => {
            void checkForUpdatesFromMenu()
          }
        },
        {
          label: 'Download Latest Version…',
          click: () => {
            void shell.openExternal(RELEASES_URL)
          }
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'Command+,',
          // Displayed but not registered: the renderer already owns ⌘, and
          // should keep owning it, so the two cannot fight.
          registerAccelerator: false,
          click: () => openSettingsSection('general')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${APP_NAME}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${APP_NAME}` }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        // ⌘W closes a file tab when one is focused and falls through to the
        // window otherwise — the behaviour the default menu already gave us.
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Clave on GitHub',
          click: () => {
            void shell.openExternal(REPO_URL)
          }
        },
        {
          label: 'Release Notes',
          click: () => {
            void shell.openExternal(RELEASES_URL)
          }
        },
        { type: 'separator' },
        {
          label: 'Open Updater Log',
          click: () => {
            void openUpdaterLog()
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
