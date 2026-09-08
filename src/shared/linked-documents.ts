import { z } from 'zod'

const header = z
  .string()
  .max(2000)
  .refine((s) => !/[\r\n\0]/.test(s), 'Header must be a single line')
export const emailSchema = z
  .object({
    from: header.default(''),
    to: header.default(''),
    cc: header.default(''),
    bcc: header.default(''),
    subject: header.default(''),
    bodyHtml: z.string().max(500000).default('<p></p>'),
    signatureHtml: z.string().max(4500000).default(''),
    signatureText: z.string().max(500000).default(''),
    replyTo: header.optional(),
    inReplyTo: header.optional(),
    references: header.optional(),
    threadId: header.optional()
  })
  .strict()
export type LinkedEmail = z.infer<typeof emailSchema>
export interface LinkedAttachment {
  id: string
  name: string
  size: number
  sha256: string
}
export interface LinkedDocument {
  id: string
  sessionId: string
  kind: 'markdown' | 'html' | 'email'
  title: string
  revision: number
  path?: string
  content: string
  sourceHash?: string
  conflict?: string
  email?: LinkedEmail
  attachments: LinkedAttachment[]
  hidden: boolean
  split: number
  scroll: number
  delivery?: {
    revision: number
    packageId: string
    status: 'sent' | 'failed' | 'unknown'
    messageId?: string
    detail?: string
  }
}
export const linkedOpenSchema = z
  .object({
    path: z.string().optional(),
    title: z.string().max(200).optional(),
    email: emailSchema.optional(),
    attachments: z.array(z.string()).max(30).optional(),
    signaturePath: z.string().optional(),
    signatureTextPath: z.string().optional()
  })
  .strict()
  .refine((v) => Boolean(v.path) !== Boolean(v.email), 'Supply exactly one of path or email')
export type LinkedOpen = z.infer<typeof linkedOpenSchema>
export const linkedUpdateSchema = z
  .object({
    content: z.string().max(2000000).optional(),
    email: emailSchema.optional(),
    hidden: z.boolean().optional(),
    split: z.number().min(0.25).max(0.75).optional(),
    scroll: z.number().min(0).optional(),
    addAttachments: z.array(z.string()).max(30).optional(),
    removeAttachments: z.array(z.string()).optional(),
    signaturePath: z.string().optional(),
    signatureTextPath: z.string().optional(),
    reloadExternal: z.boolean().optional()
  })
  .strict()
export type LinkedUpdate = z.infer<typeof linkedUpdateSchema>
export interface PreparedEmail {
  id: string
  documentId: string
  sessionId: string
  revision: number
  raw: string
  sha256: string
  threadId?: string
  messageId: string
}
export interface LinkedDocumentsAPI {
  list: () => Promise<LinkedDocument[]>
  open: (sessionId: string, input: LinkedOpen) => Promise<LinkedDocument>
  update: (id: string, revision: number, input: LinkedUpdate) => Promise<LinkedDocument>
  openAttachment: (id: string, attachmentId: string) => Promise<void>
  chooseFiles: (signature?: boolean) => Promise<string[]>
  onChanged: (callback: () => void) => () => void
}
