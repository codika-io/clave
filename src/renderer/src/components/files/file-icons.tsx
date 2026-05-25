import {
  FolderIcon,
  FolderOpenIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  PhotoIcon,
  DocumentTextIcon,
  DocumentIcon
} from '@heroicons/react/24/outline'

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

const ICON_COMPONENTS: Record<IconType, typeof DocumentIcon> = {
  folder: FolderIcon,
  code: CodeBracketIcon,
  config: Cog6ToothIcon,
  image: PhotoIcon,
  markdown: DocumentTextIcon,
  generic: DocumentIcon
}

export function FileIcon({
  name,
  isDirectory,
  isOpen,
  className
}: {
  name: string
  isDirectory?: boolean
  isOpen?: boolean
  className?: string
}) {
  const cls = `w-3.5 h-3.5 ${className ?? ''}`
  if (isDirectory) return isOpen ? <FolderOpenIcon className={cls} /> : <FolderIcon className={cls} />
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const iconType = EXT_MAP[ext] ?? 'generic'
  const Component = ICON_COMPONENTS[iconType]
  return <Component className={cls} />
}
