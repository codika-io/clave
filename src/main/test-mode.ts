/** `--test-no-activate`: the automated-testing mode where the app never steals
 *  the machine's focus.
 *
 *  An E2E run launches a second Electron instance on the same desktop the human
 *  is working on. By default that instance activates: it becomes the frontmost
 *  app, puts an icon in the Dock, and every `ready-to-show` pulls the keyboard
 *  away mid-sentence. With this flag the instance runs as a macOS *accessory*
 *  (no Dock icon, never frontmost) and shows its windows with `showInactive()`.
 *
 *  Read from `process.argv` exactly like `user-data-override.ts` reads
 *  `--user-data-dir`: a CLI flag on the launch line, nothing more. It defaults
 *  OFF, and off it changes nothing at all.
 *
 *  Consequence worth knowing before you write a test against it: under the
 *  accessory policy `BrowserWindow.getFocusedWindow()` can be null and
 *  `win.isFocused()` false for the whole run. Assert Clave-internal focus (the
 *  store's focused session, the window registry) rather than OS focus.
 */
export const TEST_NO_ACTIVATE = process.argv.includes('--test-no-activate')
