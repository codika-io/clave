import { Parser } from 'htmlparser2'
import { readFileSync, statSync } from 'fs'
import { resolve, dirname, extname } from 'path'
import nodemailer from 'nodemailer'
import sanitizeHtml from 'sanitize-html'
import { createHash, randomUUID } from 'crypto'
import type { LinkedDocument, PreparedEmail } from '../../shared/linked-documents'

export const digest = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex')

/** Reject unsupported markup explicitly: never strip a signature and silently send it. */
export function validateEmailHtml(html: string): void {
  let invalid = false
  sanitizeHtml(html, {
    allowedTags: [
      'p',
      'div',
      'br',
      'span',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'img',
      'table',
      'tbody',
      'thead',
      'tr',
      'td',
      'th',
      'hr'
    ],
    allowedAttributes: {
      '*': ['style', 'class'],
      a: ['href', 'title', 'target'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan']
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    exclusiveFilter(frame) {
      if (/(?:url\s*\(|expression\s*\(|@import)/i.test(frame.attribs.style ?? '')) invalid = true
      return false
    },
    onOpenTag(tag, attrs) {
      const allowed = [
        'p',
        'div',
        'br',
        'span',
        'strong',
        'b',
        'em',
        'i',
        'u',
        's',
        'a',
        'ul',
        'ol',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'img',
        'table',
        'tbody',
        'thead',
        'tr',
        'td',
        'th',
        'hr'
      ]
      if (
        !allowed.includes(tag) ||
        Object.keys(attrs).some(
          (k) =>
            ![
              'style',
              'class',
              'href',
              'title',
              'target',
              'colspan',
              'rowspan',
              'src',
              'alt',
              'width',
              'height',
              'align',
              'valign',
              'bgcolor',
              'border',
              'cellpadding',
              'cellspacing',
              'role',
              'data-spark-custom-html'
            ].includes(k)
        )
      )
        invalid = true
      if (
        tag === 'img' &&
        !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(attrs.src ?? '')
      )
        invalid = true
      if (attrs.href && !/^(https?:|mailto:|tel:|#)/i.test(attrs.href)) invalid = true
      if (/(?:url\s*\(|expression\s*\(|@import|\\)/i.test(attrs.style ?? '')) invalid = true
    }
  })
  if (invalid)
    throw new Error(
      'Unsupported email HTML: use text, links, tables and inline styles. Import image signatures from an HTML file to stage local/HTTPS assets. Scripts, style blocks and embedded content are unsupported.'
    )
}
/** Stage signature assets once; preview/restart/send all use these same bytes. */
export async function importSignature(
  file: string,
  request: typeof fetch = fetch
): Promise<string> {
  if (statSync(file).size > 500000) throw new Error('Signature exceeds 500 KB')
  const html = readFileSync(file, 'utf8')
  const sources = new Set<string>()
  sanitizeHtml(html, {
    onOpenTag(tag, attrs) {
      if (tag === 'img' && attrs.src) sources.add(attrs.src)
    }
  })
  const replacements = new Map<string, string>()
  let total = 0
  for (const source of sources) {
    if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(source)) {
      total += Buffer.from(source.split(',')[1], 'base64').length
      replacements.set(source, source)
    } else {
      let bytes: Buffer, type: string
      if (source.startsWith('https://')) {
        const response = await request(source, {
          signal: AbortSignal.timeout(15000),
          redirect: 'error'
        })
        if (!response.ok) throw new Error(`Signature image unavailable (HTTP ${response.status})`)
        type = (response.headers.get('content-type') ?? '').split(';')[0]
        if (!/^image\/(png|jpeg|gif|webp)$/.test(type))
          throw new Error('Signature images must be PNG, JPEG, GIF or WebP')
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Empty signature image')
        const chunks: Uint8Array[] = []
        let count = 0
        for (;;) {
          const part = await reader.read()
          if (part.done) break
          count += part.value.length
          if (count > 2000000) {
            await reader.cancel()
            throw new Error('Signature image exceeds 2 MB')
          }
          chunks.push(part.value)
        }
        bytes = Buffer.concat(chunks)
      } else {
        if (/^[a-z]+:|^\/\//i.test(source))
          throw new Error('Signature image must be a local path, data image or HTTPS URL')
        const p = resolve(dirname(file), source)
        if (statSync(p).size > 2000000) throw new Error('Signature image exceeds 2 MB')
        type = (
          {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
          } as Record<string, string>
        )[extname(p).toLowerCase()]
        if (!type) throw new Error('Signature images must be PNG, JPEG, GIF or WebP')
        bytes = readFileSync(p)
      }
      total += bytes.length
      replacements.set(source, `data:${type};base64,${bytes.toString('base64')}`)
    }
    if (total > 3000000) throw new Error('Signature images exceed 3 MB total')
  }
  // Parser-based replacement handles quotes and entity-encoded URLs without regex HTML parsing.
  let invalid = false
  const staged = sanitizeHtml(html, {
    allowedTags: false,
    allowVulnerableTags: true, // Validation below rejects active content rather than silently dropping it.
    allowedAttributes: false,
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
    transformTags: {
      img: (_tag, attrs) => ({
        tagName: 'img',
        attribs: { ...attrs, src: replacements.get(attrs.src) ?? '' }
      })
    },
    onOpenTag(tag, attrs) {
      if (tag === 'script' || Object.keys(attrs).some((k) => k.startsWith('on'))) invalid = true
    }
  })
  if (invalid) throw new Error('Unsupported active content in signature')
  validateEmailHtml(staged)
  return staged
}
export function plainText(html: string): string {
  let text = ''
  const parser = new Parser(
    {
      ontext(value) {
        text += value
      },
      onopentag(name) {
        if (name === 'br') text += '\n'
      },
      onclosetag(name) {
        if (['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3'].includes(name)) text += '\n'
      }
    },
    { decodeEntities: true }
  )
  parser.end(html)
  return text.trim()
}
export async function prepareMime(
  doc: LinkedDocument,
  files: { filename: string; content: Buffer }[]
): Promise<PreparedEmail> {
  const e = doc.email!
  for (const field of ['from', 'to', 'cc', 'bcc', 'replyTo'] as const) {
    const value = e[field]
    if (
      value &&
      !value.split(',').every((v) => /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(v.trim()))
    )
      throw new Error(`Use comma-separated email addresses in ${field}`)
  }
  if (!e.from || !(e.to || e.cc || e.bcc))
    throw new Error('From and at least one recipient are required')
  if (e.threadId && (!e.inReplyTo || !e.references))
    throw new Error('Thread replies require In-Reply-To and References')
  validateEmailHtml(e.bodyHtml)
  validateEmailHtml(e.signatureHtml)
  const id = randomUUID()
  const messageId = `<${id}@clave.local>`
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows'
  })
  const result = await transport.sendMail({
    from: e.from,
    to: e.to,
    cc: e.cc,
    bcc: e.bcc,
    subject: e.subject,
    replyTo: e.replyTo,
    inReplyTo: e.inReplyTo,
    references: e.references,
    html: e.bodyHtml + (e.signatureHtml ? `<div>${e.signatureHtml}</div>` : ''),
    text:
      plainText(e.bodyHtml) +
      (e.signatureHtml ? '\n\n' + (e.signatureText || plainText(e.signatureHtml)) : ''),
    attachments: files,
    attachDataUrls: true,
    messageId,
    keepBcc: true,
    disableFileAccess: true,
    disableUrlAccess: true
  })
  const bytes = result.message as Buffer
  return {
    id,
    documentId: doc.id,
    sessionId: doc.sessionId,
    revision: doc.revision,
    raw: bytes.toString('base64url'),
    sha256: digest(bytes),
    threadId: e.threadId,
    messageId
  }
}

export type DeliveryResult = {
  status: 'sent' | 'failed' | 'unknown'
  messageId?: string
  detail?: string
}
export type RawSender = (pkg: PreparedEmail) => Promise<DeliveryResult>
/** No reconstruction: Gmail receives exactly the frozen RFC message in raw. */
export async function sendGmail(
  pkg: PreparedEmail,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
): Promise<DeliveryResult> {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN)
    return {
      status: 'failed',
      detail:
        'Configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN in the environment that launches Clave.'
    }
  let accessToken: string
  try {
    const auth = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: env.GMAIL_CLIENT_ID,
        client_secret: env.GMAIL_CLIENT_SECRET,
        refresh_token: env.GMAIL_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      }),
      signal: AbortSignal.timeout(30000)
    })
    const body = (await auth.json()) as { access_token?: string }
    if (!auth.ok || !body.access_token)
      return { status: 'failed', detail: 'Gmail authorization failed; no email was submitted.' }
    accessToken = body.access_token
  } catch {
    return { status: 'failed', detail: 'Gmail authorization unavailable; no email was submitted.' }
  }
  try {
    const response = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: pkg.raw, ...(pkg.threadId ? { threadId: pkg.threadId } : {}) }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok)
      return {
        status: response.status >= 500 ? 'unknown' : 'failed',
        detail: `Gmail returned HTTP ${response.status}.`
      }
    const result = (await response.json()) as { id?: string }
    return result.id
      ? { status: 'sent', messageId: result.id }
      : {
          status: 'unknown',
          detail: 'Gmail returned no message id. Check Sent before taking further action.'
        }
  } catch {
    return {
      status: 'unknown',
      detail: 'Submission outcome uncertain. Check Gmail Sent; do not retry automatically.'
    }
  }
}
