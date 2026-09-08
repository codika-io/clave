import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join, resolve, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import {
  linkedOpenSchema,
  linkedUpdateSchema,
  type LinkedDocument,
  type LinkedOpen,
  type LinkedUpdate,
  type PreparedEmail
} from '../../shared/linked-documents'
import {
  digest,
  prepareMime,
  sendGmail,
  validateEmailHtml,
  importSignature,
  type RawSender
} from './email'

/** Synchronous disk critical sections serialize IPC/MCP edits. Async MIME/send use revision checks and durable send intent. */
export class LinkedDocumentStore {
  constructor(
    private root: string,
    private changed: () => void = () => {}
  ) {
    mkdirSync(root, { recursive: true, mode: 0o700 })
  }
  private file = (id: string): string => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid document id')
    return join(this.root, id + '.json')
  }
  private write(file: string, value: unknown): void {
    const temp = file + '.' + randomUUID() + '.tmp'
    writeFileSync(temp, JSON.stringify(value), { mode: 0o600 })
    renameSync(temp, file)
  }
  private index(): Record<string, string> {
    const p = join(this.root, 'index.json')
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}
  }
  list(): LinkedDocument[] {
    return Object.values(this.index()).map((id) => this.get(id))
  }
  get(id: string, sessionId?: string): LinkedDocument {
    const doc = JSON.parse(readFileSync(this.file(id), 'utf8')) as LinkedDocument
    if (sessionId && doc.sessionId !== sessionId)
      throw new Error('Document belongs to another session')
    return doc
  }
  current(sessionId: string): LinkedDocument {
    const id = this.index()[sessionId]
    if (!id) throw new Error('No linked document in this session')
    return this.get(id, sessionId)
  }
  private save(doc: LinkedDocument): LinkedDocument {
    this.write(this.file(doc.id), doc)
    this.changed()
    return doc
  }
  private check(doc: LinkedDocument, revision: number): void {
    if (doc.revision !== revision)
      throw new Error(
        `Revision conflict: expected ${revision}, current ${doc.revision}. Read the current document before editing.`
      )
  }
  private resolveFile(p: string): string {
    if (!isAbsolute(p)) throw new Error('Use an absolute local file path')
    const abs = resolve(p)
    if (!statSync(abs).isFile()) throw new Error('Expected a regular file')
    return abs
  }
  private readText(p: string): string {
    const abs = this.resolveFile(p)
    if (statSync(abs).size > 2000000) throw new Error('Document exceeds 2 MB')
    return readFileSync(abs, 'utf8')
  }
  private attachments(doc: LinkedDocument, paths: string[]): void {
    if (doc.attachments.length + paths.length > 30) throw new Error('At most 30 attachments')
    const staged = paths.map((p) => {
      const abs = this.resolveFile(p)
      if (statSync(abs).size > 18000000) throw new Error('Attachment exceeds 18 MB')
      const bytes = readFileSync(abs)
      return { bytes, name: basename(abs) }
    })
    if (
      doc.attachments.reduce((n, a) => n + a.size, 0) +
        staged.reduce((n, a) => n + a.bytes.length, 0) >
      18000000
    )
      throw new Error('Attachments exceed 18 MB total')
    for (const item of staged) {
      const id = randomUUID()
      const dir = join(this.root, doc.id, id)
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      writeFileSync(join(dir, item.name), item.bytes, { mode: 0o600 })
      doc.attachments.push({
        id,
        name: item.name,
        size: item.bytes.length,
        sha256: digest(item.bytes)
      })
    }
  }
  private signature(doc: LinkedDocument, html?: string, textPath?: string): void {
    if (!doc.email) throw new Error('Only emails have signatures')
    if (html) {
      validateEmailHtml(html)
      doc.email.signatureHtml = html
      doc.email.signatureText = textPath ? this.readText(textPath) : ''
    }
  }
  async open(sessionId: string, raw: LinkedOpen): Promise<LinkedDocument> {
    if (!sessionId) throw new Error('Calling session is required')
    const input = linkedOpenSchema.parse(raw)
    const signature = input.signaturePath
      ? await importSignature(this.resolveFile(input.signaturePath))
      : undefined
    const filePath = input.path ? this.resolveFile(input.path) : undefined
    const ext = filePath ? extname(filePath).toLowerCase() : ''
    if (filePath && !['.md', '.markdown', '.html', '.htm'].includes(ext))
      throw new Error('Linked files support Markdown and HTML')
    const prior = this.index()[sessionId]
    if (prior && filePath && this.get(prior).path === filePath)
      return this.update(prior, this.get(prior).revision, { hidden: false })
    const content = filePath ? this.readText(filePath) : ''
    const doc: LinkedDocument = {
      id: randomUUID(),
      sessionId,
      kind: filePath ? (ext === '.md' || ext === '.markdown' ? 'markdown' : 'html') : 'email',
      title: input.title || (filePath ? basename(filePath) : 'Email'),
      revision: 1,
      path: filePath,
      content,
      sourceHash: filePath ? digest(content) : undefined,
      email: input.email,
      attachments: [],
      hidden: false,
      split: 0.5,
      scroll: 0
    }
    if (doc.email) {
      validateEmailHtml(doc.email.bodyHtml)
      validateEmailHtml(doc.email.signatureHtml)
      if (input.signaturePath) this.signature(doc, signature, input.signatureTextPath)
      this.attachments(doc, input.attachments ?? [])
    } else if (input.attachments?.length || input.signaturePath)
      throw new Error('Attachments and signatures require an email')
    this.write(this.file(doc.id), doc)
    const index = this.index()
    index[sessionId] = doc.id
    this.write(join(this.root, 'index.json'), index)
    this.changed()
    return doc
  }
  async update(
    id: string,
    revision: number,
    raw: LinkedUpdate,
    sessionId?: string
  ): Promise<LinkedDocument> {
    const input = linkedUpdateSchema.parse(raw)
    this.check(this.get(id, sessionId), revision)
    const signature = input.signaturePath
      ? await importSignature(this.resolveFile(input.signaturePath))
      : undefined
    const doc = this.get(id, sessionId)
    this.check(doc, revision)
    const changesContent =
      input.content !== undefined ||
      input.email !== undefined ||
      input.addAttachments !== undefined ||
      input.removeAttachments !== undefined ||
      input.signaturePath !== undefined ||
      input.reloadExternal
    if (doc.kind === 'email') {
      if (input.content !== undefined || input.reloadExternal) throw new Error('Use email fields')
      if (input.email) {
        validateEmailHtml(input.email.bodyHtml)
        validateEmailHtml(input.email.signatureHtml)
        doc.email = input.email
      }
      if (input.removeAttachments)
        doc.attachments = doc.attachments.filter((a) => !input.removeAttachments!.includes(a.id))
      if (input.signaturePath) this.signature(doc, signature, input.signatureTextPath)
      if (input.addAttachments) this.attachments(doc, input.addAttachments)
    } else {
      if (input.email || input.addAttachments || input.removeAttachments || input.signaturePath)
        throw new Error('Email fields require an email')
      if (input.reloadExternal) {
        doc.content = this.readText(doc.path!)
        doc.sourceHash = digest(doc.content)
        delete doc.conflict
      } else if (input.content !== undefined) {
        doc.content = input.content
        try {
          if (digest(this.readText(doc.path!)) !== doc.sourceHash)
            throw new Error(
              'File changed outside this editor. Your edits are retained in Clave. Copy them before loading the external version.'
            )
          // Write through the actual path (including symlinks), preserving permissions.
          writeFileSync(doc.path!, doc.content, 'utf8')
          doc.sourceHash = digest(doc.content)
          delete doc.conflict
        } catch (error) {
          doc.conflict = error instanceof Error ? error.message : String(error)
        }
      }
    }
    if (changesContent) doc.revision++
    if (input.hidden !== undefined) doc.hidden = input.hidden
    if (input.split !== undefined) doc.split = input.split
    if (input.scroll !== undefined) doc.scroll = input.scroll
    return this.save(doc)
  }
  attachmentPath(id: string, attachmentId: string): string {
    const doc = this.get(id)
    if (!doc.attachments.some((a) => a.id === attachmentId)) throw new Error('Unknown attachment')
    return join(
      this.root,
      id,
      attachmentId,
      doc.attachments.find((a) => a.id === attachmentId)!.name
    )
  }
  async prepare(id: string, revision: number, sessionId: string): Promise<PreparedEmail> {
    const doc = this.get(id, sessionId)
    this.check(doc, revision)
    if (!doc.email) throw new Error('Only emails can be prepared')
    if (doc.delivery?.revision === revision && doc.delivery.status !== 'failed')
      throw new Error(
        `Revision already has a delivery attempt (${doc.delivery.status}); inspect its result, do not prepare a duplicate`
      )
    const files = doc.attachments.map((a) => {
      const bytes = readFileSync(this.attachmentPath(id, a.id))
      if (digest(bytes) !== a.sha256) throw new Error('Attachment integrity mismatch')
      return { filename: a.name, content: bytes }
    })
    const pkg = await prepareMime(doc, files)
    this.check(this.get(id, sessionId), revision)
    this.write(join(this.root, pkg.id + '.package.json'), pkg)
    return pkg
  }
  async send(
    packageId: string,
    sessionId: string,
    sender: RawSender = sendGmail
  ): Promise<LinkedDocument> {
    this.file(packageId)
    const pkg = JSON.parse(
      readFileSync(join(this.root, packageId + '.package.json'), 'utf8')
    ) as PreparedEmail
    const doc = this.get(pkg.documentId, sessionId)
    if (this.current(sessionId).id !== pkg.documentId)
      throw new Error('Package is no longer the linked email; reopen and review it before sending')
    if (pkg.sessionId !== sessionId || digest(Buffer.from(pkg.raw, 'base64url')) !== pkg.sha256)
      throw new Error('Package ownership or integrity mismatch')
    this.check(doc, pkg.revision)
    if (doc.delivery?.revision === pkg.revision && doc.delivery.status !== 'failed')
      throw new Error(`Delivery already attempted (${doc.delivery.status}); no automatic retry`)
    doc.delivery = {
      revision: pkg.revision,
      packageId,
      status: 'unknown',
      detail: 'Submission started; outcome not yet known. Do not retry.'
    }
    this.save(doc)
    let result: Awaited<ReturnType<RawSender>>
    try {
      result = await sender(pkg)
    } catch {
      result = {
        status: 'unknown',
        detail: 'Delivery interrupted; check Sent before further action.'
      }
    }
    // Preserve any user edits made while the send was in flight.
    const latest = this.get(doc.id, sessionId)
    latest.delivery = { revision: pkg.revision, packageId, ...result }
    return this.save(latest)
  }
}
