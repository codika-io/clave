const ICON_SIZE = 14

export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 14 14" fill="none" className={className}>
      <path
        d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H5.5L7 4H11.5C12.05 4 12.5 4.45 12.5 5V10.5C12.5 11.05 12.05 11.5 11.5 11.5H2.5C1.95 11.5 1.5 11.05 1.5 10.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CodeFileIcon({ className }: { className?: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 14 14" fill="none" className={className}>
      <path
        d="M8.5 1.5H3.5C2.95 1.5 2.5 1.95 2.5 2.5V11.5C2.5 12.05 2.95 12.5 3.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V4.5L8.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M5.5 7.5L4 9L5.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 7.5L10 9L8.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ConfigFileIcon({ className }: { className?: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 14 14" fill="none" className={className}>
      <path
        d="M8.5 1.5H3.5C2.95 1.5 2.5 1.95 2.5 2.5V11.5C2.5 12.05 2.95 12.5 3.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V4.5L8.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function ImageFileIcon({ className }: { className?: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 14 14" fill="none" className={className}>
      <path
        d="M8.5 1.5H3.5C2.95 1.5 2.5 1.95 2.5 2.5V11.5C2.5 12.05 2.95 12.5 3.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V4.5L8.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="7" r="1" stroke="currentColor" strokeWidth="1" />
      <path d="M2.5 11L5.5 8L7.5 10L9 8.5L11.5 11" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

export function MarkdownFileIcon({ className }: { className?: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 14 14" fill="none" className={className}>
      <path
        d="M8.5 1.5H3.5C2.95 1.5 2.5 1.95 2.5 2.5V11.5C2.5 12.05 2.95 12.5 3.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V4.5L8.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M4 10V7.5L5.5 9L7 7.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8.5V10M9 8.5L10.5 10M9 8.5L7.5 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function GenericFileIcon({ className }: { className?: string }) {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 14 14" fill="none" className={className}>
      <path
        d="M8.5 1.5H3.5C2.95 1.5 2.5 1.95 2.5 2.5V11.5C2.5 12.05 2.95 12.5 3.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V4.5L8.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8.5 1.5V4.5H11.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

type IconType = 'folder' | 'code' | 'config' | 'image' | 'markdown' | 'generic'

const EXT_MAP: Record<string, IconType> = {
  // Code
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code',
  py: 'code', rs: 'code', go: 'code', rb: 'code',
  java: 'code', kt: 'code', swift: 'code', c: 'code',
  cpp: 'code', h: 'code', hpp: 'code', cs: 'code',
  php: 'code', lua: 'code', sh: 'code', bash: 'code',
  zsh: 'code', fish: 'code', pl: 'code', r: 'code',
  scala: 'code', clj: 'code', ex: 'code', exs: 'code',
  erl: 'code', hs: 'code', elm: 'code', vue: 'code',
  svelte: 'code', html: 'code', css: 'code', scss: 'code',
  less: 'code', sql: 'code', graphql: 'code', gql: 'code',
  // Config
  json: 'config', yaml: 'config', yml: 'config', toml: 'config',
  ini: 'config', env: 'config', xml: 'config', lock: 'config',
  // Image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  svg: 'image', webp: 'image', ico: 'image', bmp: 'image',
  // Markdown
  md: 'markdown', mdx: 'markdown'
}

const ICON_COMPONENTS: Record<IconType, (props: { className?: string }) => React.ReactElement> = {
  folder: FolderIcon,
  code: CodeFileIcon,
  config: ConfigFileIcon,
  image: ImageFileIcon,
  markdown: MarkdownFileIcon,
  generic: GenericFileIcon
}

export function FileIcon({ name, isDirectory, className }: { name: string; isDirectory?: boolean; className?: string }) {
  if (isDirectory) return <FolderIcon className={className} />
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const iconType = EXT_MAP[ext] ?? 'generic'
  const Component = ICON_COMPONENTS[iconType]
  return <Component className={className} />
}
