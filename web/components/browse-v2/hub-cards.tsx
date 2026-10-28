import {
  LibraryIcon,
  NewspaperIcon,
  TrendingUpIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { TbBallBasketball } from 'react-icons/tb'

import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

type Hub = {
  key: 'election' | 'perps' | 'sports' | 'news'
  href: string
  title: string
  subtitle: string
  beta?: boolean
  icon: React.ComponentType<{ className?: string }>
  className: string
  iconClassName: string
}

// The hub pages. The Midterms and Perps pills were among the most-clicked
// items in the old topic row, and the Perps pill was the main way into
// /perps, so the hubs get their own large targets.
const HUBS: Hub[] = [
  {
    key: 'election',
    href: '/election',
    title: 'Midterms',
    subtitle: 'Election odds',
    icon: LibraryIcon,
    className:
      'from-blue-100 to-rose-100 dark:from-blue-900/50 dark:to-rose-900/50',
    iconClassName: 'text-blue-700 dark:text-blue-300',
  },
  {
    key: 'perps',
    href: '/perps',
    title: 'Perps',
    subtitle: 'Long stocks & crypto',
    icon: TrendingUpIcon,
    className:
      'from-teal-100 to-indigo-100 dark:from-teal-900/50 dark:to-indigo-900/50',
    iconClassName: 'text-teal-700 dark:text-teal-300',
  },
  {
    key: 'sports',
    href: '/sports',
    title: 'Sports',
    subtitle: 'Upcoming',
    beta: true,
    icon: TbBallBasketball,
    className:
      'from-amber-100 to-lime-100 dark:from-amber-900/50 dark:to-lime-900/50',
    iconClassName: 'text-amber-700 dark:text-amber-300',
  },
  {
    key: 'news',
    href: '/news',
    title: 'News',
    subtitle: 'Just in',
    beta: true,
    icon: NewspaperIcon,
    className:
      'from-slate-100 to-violet-100 dark:from-slate-800/60 dark:to-violet-900/50',
    iconClassName: 'text-violet-700 dark:text-violet-300',
  },
]

export function HubCards(props: { className?: string }) {
  const { className } = props
  return (
    <nav
      aria-label="Featured sections"
      className={clsx('grid grid-cols-4 gap-2', className)}
    >
      {HUBS.map((hub) => {
        const Icon = hub.icon
        return (
          <Link
            key={hub.key}
            href={hub.href}
            onClick={() =>
              track('click browse hub card', { destination: hub.key })
            }
            className={clsx(
              'ring-ink-200 relative flex min-w-0 flex-col items-center gap-1 rounded-xl bg-gradient-to-br px-1.5 py-2 text-center ring-1 transition-all hover:brightness-105 sm:px-2',
              'focus-visible:ring-primary-500 outline-none focus-visible:ring-2',
              hub.className
            )}
          >
            {hub.beta && (
              <span className="absolute -top-1.5 right-1.5 rounded bg-violet-600 px-1 py-px text-[9px] font-bold uppercase leading-tight tracking-wide text-white">
                Beta
              </span>
            )}
            <span className="flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:gap-1.5">
              <span className="bg-canvas-0/70 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                <Icon className={clsx('h-4 w-4', hub.iconClassName)} />
              </span>
              <span className="text-ink-900 text-[13px] font-semibold leading-tight sm:text-sm">
                {hub.title}
              </span>
            </span>
            {/* Use the full card width; omit subtitles on narrow phones. */}
            <span className="text-ink-600 hidden w-full text-xs leading-4 sm:block">
              {hub.key === 'sports' ? <SportsStatus /> : hub.subtitle}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function SportsStatus() {
  const [hasLiveGames, setHasLiveGames] = useState<boolean>()
  const isMobile = useIsMobile()
  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (!isPageVisible || isMobile) return
    let active = true
    const refresh = async () => {
      try {
        // The live count covers all sports regardless of the page size.
        const schedule = await api('sports-schedule', {
          sport: 'all',
          limit: 1,
        })
        if (active) setHasLiveGames(schedule.liveCount > 0)
      } catch {
        // Don't leave a stale "Live" claim up if the status can't refresh.
        if (active) setHasLiveGames(undefined)
      }
    }
    refresh()
    const interval = setInterval(refresh, 60_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [isPageVisible, isMobile])

  return (
    <span className="flex min-h-[1rem] items-center justify-center gap-1">
      {hasLiveGames === undefined ? null : hasLiveGames ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
          Live
        </>
      ) : (
        'Upcoming'
      )}
    </span>
  )
}

