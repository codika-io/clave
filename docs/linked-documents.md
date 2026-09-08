# Edit alongside an agent session

In a Claude Code or Codex tab running inside Clave, ask:

> Open `/absolute/path/to/notes.md` beside this session so I can edit it.

The agent calls `clave_open_side_panel`. The session immediately focuses into conversation on the left and editing on the right. Select another session and return: the pair, split width and document scroll are preserved. Drag the divider or focus it and use left/right arrow keys. Hide closes the panel; **Open linked document** brings it back. Linking another item preserves the old record in profile storage, but the MVP only exposes the current item per session (there is no draft library yet).

Markdown uses the rendered editor with a Source toggle. HTML opens in Source, with a Rendered toggle that uses the existing directory-scoped preview protocol: sibling CSS, scripts and images work. HTML is source editing plus preview, not arbitrary visual page editing. Independent file tabs continue to work.

Every edit autosaves. The **Saved** status means main-process persistence completed. A file modified externally produces a visible conflict: user edits remain in Clave's profile and the external file stays untouched. **Copy my edits** preserves your version before **Load saved version** loads the external source. If an agent races an edit, revision checks refuse its stale update. Agent handoff flushes the editor's pending saves before reading/preparing/sending.

## Compose an email

The agent supplies a structured email:

```json
{
  "email": {
    "from": "sender@example.test",
    "to": "reader@example.test",
    "subject": "Project follow-up",
    "bodyHtml": "<p>Hello,</p><p>Here is the revised proposal.</p>"
  },
  "attachments": ["/absolute/path/to/proposal.pdf"],
  "signaturePath": "/absolute/path/to/signature.html"
}
```

Recipients are comma-separated bare email addresses. The composer edits From, To, Cc, Bcc, Subject and the rendered body. The signature is a separate preview: **Import HTML** replaces it; choose **No signature** in the **Signature choice** menu to remove it. **Add files** copies attachment bytes into Clave's private profile; clicking an attachment opens the retained file with its original filename and extension. Removing a source file afterward does not affect the draft.

Signature imports accept ordinary email tables, presentation attributes and inline styles. Local, data and HTTPS PNG/JPEG/GIF/WebP images are staged once and embedded as CID attachments at preparation. Self-contained data-URL SVG background layers are validated and rasterized to PNG at import; scripts, fonts and external SVG resources cannot load. The original dimensions, CSS layout and repeated layers are retained, and identical images share a CID part. Source URLs are never re-fetched at send time. Raster types are identified from their bytes, so a JPEG served as `application/octet-stream` works; a misleading image header does not make other content acceptable. HTTPS redirects, active content, unstaged image URLs, SVG with external resources, style blocks and unsupported markup are explicitly rejected; Clave does not silently strip the signature. SVG inputs are limited to 100 KB, 500 elements and explicit dimensions no greater than 1024 × 1024, with bounded filters. Each image is limited to 2 MB, signature images to 3 MB total, attachments to 18 MB total (30 files), and linked files to 2 MB. `signatureTextPath` optionally supplies the plain-text signature twin. Otherwise text is derived from the reviewed HTML. Email clients can render HTML differently.

The agent reads and updates through `clave_side_panel`:

```json
{ "action": "read" }
```

Read returns the current document including its `revision`. Update uses `{"action":"update","revision":7,"update":{"email":{...completeEmailFields}}}`. A stale revision is rejected: read again and reconcile with the user's changes. Never rebuild an email from conversation memory. Reply metadata (`replyTo`, `inReplyTo`, `references`, `threadId`) lives in the email object; Gmail thread replies need both reply headers and the matching subject.

## Agent-driven send

Sending is optional and requires Gmail OAuth credentials in the environment that **launches Clave**:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN` with Gmail send permission (`https://www.googleapis.com/auth/gmail.send`)

The From address must be authorized for the Gmail account (account address or configured sending alias). Clave does not provision accounts or ship credentials/signatures. Use your existing private environment mechanism; do not paste secrets into agent messages or commit them. An installed app launched from the Dock may not inherit your shell variables; start the dev process from your configured shell for this MVP.

After the user explicitly asks to send, the agent:

1. Reads the current document (flushes pending editor saves).
2. Calls `{"action":"prepare","revision":7}`. This is **not sending**. Clave freezes a complete MIME message with the exact HTML, plain text, staged image bytes, attachment bytes, recipients and reply headers. The tool returns `packageId`, revision, checksum and RFC Message-ID.
3. Calls `{"action":"send","packageId":"<returned id>","userConfirmed":true}` only for the user's send instruction. The adapter refreshes OAuth and submits the stored raw MIME bytes to Gmail unchanged.
4. Reads the persisted result: **sent**, **failed**, or **unknown**. Success means Gmail accepted the message, not a delivery/read receipt.

A package cannot send after the draft changes or another email replaces it. Sent and uncertain attempts cannot be retried. Attempts remain recorded per revision even when older sends finish after newer ones. A document-owned seal validates the full frozen package, including revision, thread metadata and MIME, before transport. Packages prepared by an older development build without a seal must be prepared again before sending. A definite failure (including missing configuration or authorization) permits an explicit retry of the same package after fixing the cause. Do not create duplicate revisions to bypass guards. For unknown delivery, check Gmail Sent using the recorded Message-ID before further action; this MVP does not reconcile delivery automatically. Edits after a send are an unsent revision; the composer keeps the previous send revision explicit.

Docs: [Gmail sending guide](https://developers.google.com/workspace/gmail/api/guides/sending), [messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), [Nodemailer stream transport](https://nodemailer.com/transports/stream).

## Test locally in dev

From this worktree:

```sh
npm install
npm run dev -- -- --user-data-dir=/tmp/clave-linked-documents-dev
```

This opens a separate development profile and does not replace your installed Clave. If this dev process is already running from an earlier revision, stop and restart it with the same command and user-data directory to load the new main-process and preload IPC handlers; renderer HMR alone is insufficient. Add a disposable workspace folder, start Claude Code or Codex there, and use the prompts above. Newly started sessions discover the new MCP tools; old sessions in the installed version do not.

Suggested walkthrough:

1. Create a small `.md` file, ask the agent to open it linked, edit a sentence, and check **Saved** and the file on disk.
2. Switch tabs, return, resize, hide/reopen; quit and reopen dev with the same profile. If Clave offers **Restore**, restore the originating sessions.
3. Edit the source from another editor, then type in Clave. Confirm the conflict appears and both versions remain recoverable.
4. Ask for a synthetic email, add a test attachment, import an HTML signature with a local image, then delete the original attachment/image. Confirm previews and the retained attachment still open.
5. Edit the message and immediately ask the agent to read it back or prepare it. Verify its last character and revision. Preparation does not contact Gmail.
6. Only if you want to test real sending: configure your own OAuth environment and explicitly ask to send a test message to your own address. No live mail is sent by the automated suite.

Automated gates:

```sh
npm run typecheck
npm run build
npm test
npm run test:e2e -- linked-documents
npm run test:e2e -- html-preview-state
```

The Playwright suite drives real Electron IPC and authenticated MCP, substitutes Gmail fetch in the isolated test instance, and asserts byte-for-byte package transport. It never uses live email credentials. The existing repository-wide lint has baseline errors; this feature's changed/new files are checked separately and compared against the scope base.


Default signatures are stored as an HTML file pointer in the current app profile. In the composer, **Set default** / **Change default** chooses a file, applies a staged copy to this email and uses the file for future drafts. An adjacent `.txt` twin supplies the plain-text signature when present. Existing drafts retain their staged copies when the source file or default preference changes.

The **Signature choice** menu applies the latest default explicitly, removes the signature for this email, or restores this email's custom signature. Import HTML stages a custom signature for only this draft. A missing or invalid default shows a recoverable error and prevents preparation until you choose a valid file or No signature. Body, recipients and attachments remain intact.

Agents can pass `signatureMode: "none"` when opening an email to opt out, or `signatureMode: "default"` to request the configured default explicitly. Fresh emails without custom signature content/path use the default automatically. Updates accept `signatureMode: "default" | "none" | "custom"`; `custom` restores a previously staged custom signature. Do not combine `signatureMode` with `signaturePath`. Optional Cc/Bcc controls expand from the composer; populated copy fields stay visible.


The macOS packaging hook stages both locked resvg native packages through npm, verifies their lockfile integrity and combines them into the loader's supported universal binding. This keeps SVG signature import available on Intel and Apple Silicon Macs. To verify an unsigned universal directory build, run `node tests/e2e/packaged-signature-smoke.mjs /absolute/path/Clave.app`; it launches the packaged app in both architectures with isolated temporary profiles and renders a synthetic SVG. It requires Rosetta on Apple Silicon.
