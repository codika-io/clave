import {
  UserIcon as UserHero,
  CodeBracketIcon,
  CommandLineIcon,
  RocketLaunchIcon,
  BoltIcon,
  FireIcon,
  HeartIcon,
  StarIcon,
  MoonIcon,
  SunIcon,
  CubeIcon,
  BeakerIcon
} from '@heroicons/react/24/solid'
import type { UserIcon } from '../../store/user-store'

const ICON_MAP: Record<UserIcon, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  user: UserHero,
  code: CodeBracketIcon,
  terminal: CommandLineIcon,
  rocket: RocketLaunchIcon,
  bolt: BoltIcon,
  fire: FireIcon,
  heart: HeartIcon,
  star: StarIcon,
  moon: MoonIcon,
  sun: SunIcon,
  cube: CubeIcon,
  beaker: BeakerIcon
}

export function UserIconDisplay({
  icon,
  color,
  size = 'md'
}: {
  icon: UserIcon
  color: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const Icon = ICON_MAP[icon] ?? UserHero
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-16 h-16 rounded-2xl'
  }
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7'
  }

  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: color + '20' }}
    >
      <Icon className={iconSizes[size]} style={{ color }} />
    </div>
  )
}

export { ICON_MAP }
