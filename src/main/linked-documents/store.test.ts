import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { LinkedDocumentStore } from './store'
import { emailSchema } from '../../shared/linked-documents'
import { importSignature, sendGmail, validateEmailHtml, plainText } from './email'
const dirs: string[] = []
function fixture(): { root: string; store: LinkedDocumentStore } {
  const root = mkdtempSync(join(tmpdir(), 'clave-linked-'))
  dirs.push(root)
  return { root, store: new LinkedDocumentStore(join(root, 'store')) }
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const email = (): ReturnType<typeof emailSchema.parse> =>
  emailSchema.parse({
    from: 'sender@example.test',
    to: 'reader@example.test',
    subject: 'Synthetic subject',
    bodyHtml: '<p>Hello <strong>reader</strong>.</p>',
    signatureHtml: '<table cellpadding="0"><tr><td>Example team</td></tr></table>'
  })
describe('linked documents boundaries', () => {
  // Independent verifier repros: an old in-flight completion and an altered package revision.
  it.each(['sent', 'failed', 'unknown'] as const)(
    'keeps the newer revision guarded when an older %s result arrives last',
    async (oldStatus) => {
      const { root, store } = fixture()
      const doc = await store.open('one', { email: email() })
      const oldPackage = await store.prepare(doc.id, 1, 'one')
      let finish!: () => void
      const barrier = new Promise<void>((resolve) => {
        finish = resolve
      })
      const oldSend = store.send(oldPackage.id, 'one', async () => {
        await barrier
        return { status: oldStatus }
      })
      await store.update(doc.id, 1, { email: { ...email(), subject: 'New reviewed subject' } })
      const newPackage = await store.prepare(doc.id, 2, 'one')
      let calls = 0
      await store.send(newPackage.id, 'one', async () => {
        calls++
        return { status: 'sent', messageId: 'new-message' }
      })
      finish()
      await oldSend
      const restarted = new LinkedDocumentStore(join(root, 'store'))
      const current = restarted.get(doc.id)
      expect(current.email?.subject).toBe('New reviewed subject')
      expect(current.delivery).toMatchObject({
        revision: 2,
        status: 'sent',
        messageId: 'new-message'
      })
      expect(current.deliveries?.['1'].status).toBe(oldStatus)
      expect(current.deliveries?.['2'].status).toBe('sent')
      await expect(
        restarted.send(newPackage.id, 'one', async () => {
          calls++
          return { status: 'sent' }
        })
      ).rejects.toThrow('already attempted')
      expect(calls).toBe(1)
    }
  )

  it.each(['revision', 'threadId', 'messageId', 'sessionId', 'id'] as const)(
    'refuses altered frozen package %s metadata before transport',
    async (field) => {
      const { root, store } = fixture()
      const doc = await store.open('one', { email: email() })
      const pkg = await store.prepare(doc.id, 1, 'one')
      if (field === 'revision')
        await store.update(doc.id, 1, { email: { ...email(), subject: 'New reviewed subject' } })
      writeFileSync(
        join(root, 'store', pkg.id + '.package.json'),
        JSON.stringify({ ...pkg, [field]: field === 'revision' ? 2 : 'altered' })
      )
      let calls = 0
      await expect(
        store.send(pkg.id, 'one', async () => {
          calls++
          return { status: 'sent' }
        })
      ).rejects.toThrow('integrity')
      expect(calls).toBe(0)
    }
  )

  it('stages a generic HTTP response only when its bytes identify a supported raster image', async () => {
    const { root } = fixture()
    const path = join(root, 'signature.html')
    writeFileSync(path, '<img src="https://synthetic.example.test/avatar" alt="Synthetic" />')
    // Synthetic JPEG signature and body; no personal image or remote URL is retained.
    const bytes = Buffer.concat([
      Buffer.from('ffd8ffe000104a46494600010100000100010000', 'hex'),
      Buffer.alloc(54_407),
      Buffer.from('ffd9', 'hex')
    ])
    const html = await importSignature(
      path,
      async () => new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })
    )
    expect(html).toContain(`data:image/jpeg;base64,${bytes.toString('base64')}`)
    for (const type of ['application/octet-stream', 'image/jpeg']) {
      await expect(
        importSignature(
          path,
          async () =>
            new Response('<svg>not a raster image</svg>', { headers: { 'content-type': type } })
        )
      ).rejects.toThrow('must contain')
    }
  })

  it('plain text decodes HTML entities and retains paragraph breaks', () => {
    expect(plainText('<p>Caf&eacute; &amp; tea</p><p>&#x1F44B;</p>')).toBe('Café & tea\n👋')
  })
  it('retains external conflict edits on disk, rejects stale agent revisions, reloads explicitly', async () => {
    const { root, store } = fixture(),
      path = join(root, 'a.md')
    writeFileSync(path, '# Original')
    const doc = await store.open('one', { path })
    writeFileSync(path, '# Agent change')
    const edited = await store.update(doc.id, 1, { content: '# User change' })
    expect(edited.conflict).toContain('outside')
    expect(readFileSync(path, 'utf8')).toBe('# Agent change')
    expect(new LinkedDocumentStore(join(root, 'store')).current('one').content).toBe(
      '# User change'
    )
    await expect(store.update(doc.id, 1, { content: 'stale' }, 'one')).rejects.toThrow(
      'Revision conflict'
    )
    const reloaded = await store.update(doc.id, 2, { reloadExternal: true })
    expect(reloaded.content).toBe('# Agent change')
    expect(reloaded.conflict).toBeUndefined()
  })
  it('copies attachment bytes, preserves names, packages exact MIME and blocks repeated/uncertain sends across restarts', async () => {
    const { root, store } = fixture(),
      path = join(root, 'original.pdf')
    const bytes = Buffer.from([0, 1, 255, 40])
    writeFileSync(path, bytes)
    const doc = await store.open('one', { email: email(), attachments: [path] })
    rmSync(path)
    expect(store.attachmentPath(doc.id, doc.attachments[0].id)).toMatch(/original\.pdf$/)
    const pkg = await store.prepare(doc.id, 1, 'one')
    const raw = Buffer.from(pkg.raw, 'base64url').toString()
    expect(raw).toContain(bytes.toString('base64'))
    expect(raw).toContain('multipart/mixed')
    expect(raw).toContain('Example team')
    let calls = 0
    const sent = await store.send(pkg.id, 'one', async (received) => {
      calls++
      expect(received.raw).toBe(pkg.raw)
      return { status: 'unknown' }
    })
    expect(sent.delivery?.status).toBe('unknown')
    await expect(
      new LinkedDocumentStore(join(root, 'store')).send(pkg.id, 'one', async () => {
        calls++
        return { status: 'sent' }
      })
    ).rejects.toThrow('already attempted')
    expect(calls).toBe(1)
  })
  it('permits an explicit retry after definite failure, preserves edits during flight and rejects stale packages', async () => {
    const { store } = fixture()
    const doc = await store.open('one', { email: email() })
    const pkg = await store.prepare(doc.id, 1, 'one')
    expect(
      (await store.send(pkg.id, 'one', async () => ({ status: 'failed' }))).delivery?.status
    ).toBe('failed')
    await store.send(pkg.id, 'one', async () => {
      await store.update(doc.id, 1, { email: { ...email(), subject: 'New edits' } })
      return { status: 'sent', messageId: '123' }
    })
    const latest = store.get(doc.id)
    expect(latest.revision).toBe(2)
    expect(latest.delivery?.revision).toBe(1)
    await expect(store.send(pkg.id, 'one')).rejects.toThrow('Revision conflict')
  })
  it('enforces package owner and attachment integrity', async () => {
    const { root, store } = fixture(),
      path = join(root, 'a.txt')
    writeFileSync(path, 'intact')
    const doc = await store.open('one', { email: email(), attachments: [path] })
    await expect(store.prepare(doc.id, 1, 'two')).rejects.toThrow('another session')
    writeFileSync(store.attachmentPath(doc.id, doc.attachments[0].id), 'changed')
    await expect(store.prepare(doc.id, 1, 'one')).rejects.toThrow('integrity')
  })
  it('rejects modified frozen MIME and packages from a replaced linked email', async () => {
    const { root, store } = fixture()
    const doc = await store.open('one', { email: email() })
    const pkg = await store.prepare(doc.id, 1, 'one')
    const path = join(root, 'store', pkg.id + '.package.json')
    writeFileSync(
      path,
      JSON.stringify({ ...pkg, raw: Buffer.from('changed MIME').toString('base64url') })
    )
    let called = false
    await expect(
      store.send(pkg.id, 'one', async () => {
        called = true
        return { status: 'sent' }
      })
    ).rejects.toThrow('integrity')
    expect(called).toBe(false)
    writeFileSync(path, JSON.stringify(pkg))
    await store.open('one', { email: { ...email(), subject: 'A different email' } })
    await expect(store.send(pkg.id, 'one')).rejects.toThrow('no longer the linked email')
  })

  it('stages local and HTTPS signature images and preserves CID assets in MIME after source removal', async () => {
    const { root, store } = fixture()
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6pZsAAAAASUVORK5CYII=',
      'base64'
    )
    writeFileSync(join(root, 'logo.png'), image)
    const path = join(root, 'signature.html')
    writeFileSync(
      path,
      '<table cellpadding="0" cellspacing="0" role="presentation"><tr><td align="left"><img src="logo.png" width="62" height="62" alt="Logo" /></td><td><a href="https://example.test">Synthetic team</a></td></tr></table>'
    )
    const doc = await store.open('one', { email: email(), signaturePath: path })
    rmSync(join(root, 'logo.png'))
    expect(doc.email?.signatureHtml).toContain('data:image/png;base64,')
    const pkg = await store.prepare(doc.id, 1, 'one')
    const mime = Buffer.from(pkg.raw, 'base64url').toString()
    expect(mime).toContain('Content-ID:')
    expect(mime).toContain('cid:')
    expect(mime).toContain(image.toString('base64').slice(0, 60))
    writeFileSync(path, '<img src="https://example.test/logo.png" alt="Remote" />')
    let fetched = 0
    const staged = await importSignature(path, async () => {
      fetched++
      return new Response(image, { headers: { 'content-type': 'image/png' } })
    })
    expect(fetched).toBe(1)
    expect(staged).toContain('data:image/png;base64,')
    expect(staged).not.toContain('https://example.test/logo.png')
  })
  it('rejects active or unresolved signature content instead of silently dropping it', () => {
    for (const html of [
      '<script>alert(1)</script>',
      '<img src="https://x.test/a.png">',
      '<div onclick="x()">x</div>',
      '<div style="background:url(https://x.test)">x</div>'
    ])
      expect(() => validateEmailHtml(html)).toThrow('Unsupported')
  })
  it('Gmail adapter submits the prepared raw package unchanged and classifies preflight/network failures', async () => {
    const { store } = fixture()
    const doc = await store.open('one', { email: email() })
    const pkg = await store.prepare(doc.id, 1, 'one')
    const env = {
      GMAIL_CLIENT_ID: 'fake',
      GMAIL_CLIENT_SECRET: 'fake',
      GMAIL_REFRESH_TOKEN: 'fake'
    }
    let body = ''
    const fake: typeof fetch = async (url, init) => {
      if (String(url).includes('oauth2')) return Response.json({ access_token: 'fake' })
      body = String(init?.body)
      return Response.json({ id: 'sent-1' })
    }
    expect((await sendGmail(pkg, env, fake)).status).toBe('sent')
    expect(JSON.parse(body).raw).toBe(pkg.raw)
    expect((await sendGmail(pkg, {}, fake)).status).toBe('failed')
    expect(
      (
        await sendGmail(pkg, env, async (url) => {
          if (String(url).includes('oauth2')) return Response.json({ access_token: 'fake' })
          throw Error('dropped')
        })
      ).status
    ).toBe('unknown')
  })
})
