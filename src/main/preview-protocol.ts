import { protocol } from 'electron'
import { randomBytes } from 'crypto'
import * as path from 'path'
import * as fs from 'fs'

/**
 * clave-preview:// — serves a registered HTML file and its sibling assets to
 * the renderer's preview iframes (HTML file tabs, group web views).
 *
 * Agent-authored HTML is untrusted input, so the protocol is scoped hard:
 * each registered entry file maps to a random token whose root is the file's
 * own directory. `clave-preview://<token>/<relpath>` resolves inside that root
 * only — traversal and symlink escapes are refused, unknown tokens 404. The
 * token is the URL host (the scheme is "standard"), so the page's own relative
 * asset references resolve naturally within its directory.
 */

const ROOT_BY_TOKEN = new Map<string, string>()
const TOKEN_BY_FILE = new Map<string, string>()

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/plain',
  xml: 'application/xml',
  map: 'application/json',
  wasm: 'application/wasm'
}

/** MUST run before app ready — grants the scheme URL semantics (host + relative
 *  resolution) and fetch()-ability from the sandboxed preview frames. */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'clave-preview',
      privileges: { standard: true, supportFetchAPI: true, corsEnabled: true }
    }
  ])
}

/**
 * Register an HTML file for preview and return its clave-preview URL.
 * Idempotent per file path (same token across calls, so iframe reloads and
 * tab dedup keep one origin per file).
 */
export function registerPreviewFile(filePath: string): { url: string } {
  const abs = path.resolve(filePath)
  const stat = fs.statSync(abs)
  if (!stat.isFile()) throw new Error(`Not a file: ${abs}`)
  let token = TOKEN_BY_FILE.get(abs)
  if (!token) {
    token = randomBytes(12).toString('hex')
    TOKEN_BY_FILE.set(abs, token)
    ROOT_BY_TOKEN.set(token, path.dirname(abs))
  }
  return { url: `clave-preview://${token}/${encodeURIComponent(path.basename(abs))}` }
}

function respond(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

/** Install the request handler. Call after app ready. */
export function installPreviewProtocol(): void {
  protocol.handle('clave-preview', async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return respond(400, 'Bad preview URL')
    }
    const root = ROOT_BY_TOKEN.get(url.host)
    if (!root) return respond(404, 'Unknown preview')

    const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const target = path.normalize(path.join(root, relPath))
    if (target !== root && !target.startsWith(root + path.sep)) {
      return respond(403, 'Outside preview root')
    }
    try {
      // realpath both sides so a symlink inside the root can't read outside it.
      const [realTarget, realRoot] = await Promise.all([
        fs.promises.realpath(target),
        fs.promises.realpath(root)
      ])
      if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
        return respond(403, 'Outside preview root')
      }
      const stat = await fs.promises.stat(realTarget)
      if (!stat.isFile()) return respond(404, 'Not found')
      const data = await fs.promises.readFile(realTarget)
      const ext = path.extname(realTarget).slice(1).toLowerCase()
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': MIME_BY_EXT[ext] ?? 'application/octet-stream',
          // Opaque-origin frames (sandbox without allow-same-origin) fetch
          // their assets cross-origin; the wildcard keeps those requests alive.
          'Access-Control-Allow-Origin': '*',
          // Files under active edit must never go stale in the frame.
          'Cache-Control': 'no-cache'
        }
      })
    } catch {
      return respond(404, 'Not found')
    }
  })
}
