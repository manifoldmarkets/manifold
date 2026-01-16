import clsx from 'clsx'
import { DIVISION_NAMES } from 'common/leagues'
import { Col } from '../layout/col'

// Division colors - clean, professional design with subtle color accents
// Uses muted colors that work well in both light and dark mode
export const DIVISION_STYLES: {
  [key: number]: {
    bg: string
    border: string
    text: string
    accent: string
  }
} = {
  0: {
    bg: 'bg-ink-100 dark:bg-ink-800',
    border: 'border-ink-200 dark:border-ink-700',
    text: 'text-ink-600 dark:text-ink-400',
    accent: 'bg-ink-400',
  },
  1: {
    // Bronze
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    accent: 'bg-amber-500',
  },
  2: {
    // Silver
    bg: 'bg-slate-50 dark:bg-slate-900/50',
    border: 'border-slate-300 dark:border-slate-600',
    text: 'text-slate-600 dark:text-slate-300',
    accent: 'bg-slate-400',
  },
  3: {
    // Gold
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-300 dark:border-yellow-700',
    text: 'text-yellow-700 dark:text-yellow-400',
    accent: 'bg-yellow-500',
  },
  4: {
    // Platinum
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    border: 'border-cyan-200 dark:border-cyan-800',
    text: 'text-cyan-700 dark:text-cyan-400',
    accent: 'bg-cyan-500',
  },
  5: {
    // Diamond
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    border: 'border-violet-200 dark:border-violet-800',
    text: 'text-violet-700 dark:text-violet-400',
    accent: 'bg-violet-500',
  },
  6: {
    // Masters
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    accent: 'bg-rose-500',
  },
}

export function DivisionBadge(props: {
  division: number
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
  className?: string
}) {
  const { division, size = 'md', showName = true, className } = props
  const style = DIVISION_STYLES[division] ?? DIVISION_STYLES[1]
  const name = DIVISION_NAMES[division] ?? 'Unknown'

  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-sm font-medium',
  }

  return (
    <Col className={clsx('items-center gap-1', className)}>
      <div
        className={clsx(
          'flex items-center justify-center rounded-lg border font-semibold',
          sizeClasses[size],
          style.bg,
          style.border,
          style.text
        )}
      >
        {division}
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
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5',
        'border text-sm font-medium',
        style.bg,
        style.border,
        style.text,
        className
      )}
    >
      <span className="font-semibold">{division}</span>
      <span>{name}</span>
    </span>
  )
}

// Helper to get styling for rank zones - subtle, professional indicators
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
      classes: 'bg-teal-50/80 dark:bg-teal-1000/80',
    }
  }
  if (rank <= promotionCount) {
    return {
      zone: 'promote',
      classes: 'bg-teal-50/50 dark:bg-teal-1000/40',
    }
  }
  if (rank > totalUsers - demotionCount) {
    return {
      zone: 'demote',
      classes: 'bg-scarlet-50/40 dark:bg-scarlet-1000/40',
    }
  }
  return {
    zone: 'stay',
    classes: '',
  }
}
