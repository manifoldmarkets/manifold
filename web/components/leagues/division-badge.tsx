import clsx from 'clsx'
import { DIVISION_NAMES } from 'common/leagues'
import { Col } from '../layout/col'

// Division colors and styling - inspired by gaming/esports aesthetics
// Text colors use darker shades for light mode visibility
export const DIVISION_STYLES: {
  [key: number]: {
    bg: string
    border: string
    text: string
    glow: string
    icon: string
    gradient: string
  }
} = {
  0: {
    bg: 'bg-slate-500/20',
    border: 'border-slate-400',
    text: 'text-slate-600 dark:text-slate-300',
    glow: 'shadow-slate-500/30',
    icon: '💿',
    gradient: 'from-slate-600 to-slate-400',
  },
  1: {
    bg: 'bg-amber-900/30',
    border: 'border-amber-600',
    text: 'text-amber-700 dark:text-amber-500',
    glow: 'shadow-amber-500/40',
    icon: '🥉',
    gradient: 'from-amber-700 to-amber-500',
  },
  2: {
    bg: 'bg-slate-400/20',
    border: 'border-slate-400 dark:border-slate-300',
    text: 'text-slate-600 dark:text-slate-300',
    glow: 'shadow-slate-400/40',
    icon: '🥈',
    gradient: 'from-slate-500 to-slate-300',
  },
  3: {
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500 dark:border-yellow-400',
    text: 'text-yellow-600 dark:text-yellow-400',
    glow: 'shadow-yellow-400/50',
    icon: '🥇',
    gradient: 'from-yellow-500 to-yellow-300',
  },
  4: {
    bg: 'bg-cyan-500/20',
    border: 'border-cyan-500 dark:border-cyan-400',
    text: 'text-cyan-600 dark:text-cyan-400',
    glow: 'shadow-cyan-400/50',
    icon: '💍',
    gradient: 'from-cyan-500 to-cyan-300',
  },
  5: {
    bg: 'bg-violet-500/20',
    border: 'border-violet-500 dark:border-violet-400',
    text: 'text-violet-600 dark:text-violet-400',
    glow: 'shadow-violet-400/50',
    icon: '💠',
    gradient: 'from-violet-500 to-violet-300',
  },
  6: {
    bg: 'bg-rose-500/20',
    border: 'border-rose-500 dark:border-rose-400',
    text: 'text-rose-600 dark:text-rose-400',
    glow: 'shadow-rose-400/60',
    icon: '👑',
    gradient: 'from-rose-500 via-orange-400 to-yellow-400',
  },
}

export function DivisionBadge(props: {
  division: number
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
  className?: string
  glow?: boolean
}) {
  const {
    division,
    size = 'md',
    showName = true,
    className,
    glow = false,
  } = props
  const style = DIVISION_STYLES[division] ?? DIVISION_STYLES[1]
  const name = DIVISION_NAMES[division] ?? 'Unknown'

  const sizeClasses = {
    sm: 'w-8 h-8 text-lg',
    md: 'w-12 h-12 text-2xl',
    lg: 'w-16 h-16 text-3xl',
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm font-medium',
    lg: 'text-base font-semibold',
  }

  return (
    <Col className={clsx('items-center gap-1', className)}>
      <div
        className={clsx(
          'relative flex items-center justify-center rounded-xl border-2',
          'transition-all duration-300',
          sizeClasses[size],
          style.bg,
          style.border,
          glow && `shadow-lg ${style.glow}`
        )}
      >
        <span className="relative z-10">{style.icon}</span>
        {/* Subtle inner glow effect */}
        <div
          className={clsx(
            'absolute inset-0 rounded-xl opacity-30',
            `bg-gradient-to-br ${style.gradient}`
          )}
        />
      </div>
      {showName && (
        <span className={clsx(textSizeClasses[size], style.text)}>{name}</span>
      )}
    </Col>
  )
}

export function DivisionBadgeInline(props: {
  division: number
  className?: string
}) {
  const { division, className } = props
  const style = DIVISION_STYLES[division] ?? DIVISION_STYLES[1]
  const name = DIVISION_NAMES[division] ?? 'Unknown'

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5',
        'border font-medium',
        style.bg,
        style.border,
        style.text,
        className
      )}
    >
      <span className="text-sm">{style.icon}</span>
      <span className="text-xs">{name}</span>
    </span>
  )
}

// Helper to get a color class for a division rank zone
export function getRankZoneStyles(
  rank: number,
  totalUsers: number,
  promotionCount: number,
  doublePromotionCount: number,
  demotionCount: number
): { zone: 'double-promote' | 'promote' | 'stay' | 'demote'; classes: string } {
  if (rank <= doublePromotionCount) {
    return {
      zone: 'double-promote',
      classes:
        'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-l-4 border-emerald-400',
    }
  }
  if (rank <= promotionCount) {
    return {
      zone: 'promote',
      classes:
        'bg-gradient-to-r from-teal-500/10 to-cyan-500/10 border-l-4 border-teal-400',
    }
  }
  if (rank > totalUsers - demotionCount) {
    return {
      zone: 'demote',
      classes:
        'bg-gradient-to-r from-rose-500/10 to-red-500/10 border-l-4 border-rose-400',
    }
  }
  return {
    zone: 'stay',
    classes: '',
  }
}
