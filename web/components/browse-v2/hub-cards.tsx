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
  subtitleClassName?: string
  beta?: boolean
  icon: React.ComponentType<{ className?: string }>
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
    subtitleClassName: '[@container(min-width:72px)]:block',
    icon: LibraryIcon,
  },
  {
    key: 'perps',
    href: '/perps',
    title: 'Perps',
    subtitle: 'Long stocks & crypto',
    icon: TrendingUpIcon,
  },
  {
    key: 'sports',
    href: '/sports',
    title: 'Sports',
    subtitle: 'Upcoming',
    subtitleClassName: '[@container(min-width:56px)]:block',
    beta: true,
    icon: TbBallBasketball,
  },
  {
    key: 'news',
    href: '/news',
    title: 'News',
    subtitle: 'Just in',
    subtitleClassName: '[@container(min-width:40px)]:block',
    beta: true,
    icon: NewspaperIcon,
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
              'bg-canvas-0 ring-ink-200 hover:bg-ink-100 relative flex min-w-0 flex-col items-center gap-1 rounded-md px-1.5 py-1.5 text-center ring-1 transition-colors sm:flex-row sm:gap-2 sm:px-2 sm:py-2 sm:text-left',
              'focus-visible:ring-primary-500 outline-none focus-visible:ring-2'
            )}
          >
            {hub.beta && (
              <span className="bg-canvas-0 text-ink-600 absolute -top-1.5 right-1.5 rounded px-1 py-px text-[9px] font-bold uppercase leading-tight tracking-wide">
                Beta
              </span>
            )}
            <span className="text-primary-600 flex h-6 w-6 shrink-0 items-center justify-center sm:h-9 sm:w-9">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className="w-full min-w-0 [container-type:inline-size] sm:w-auto sm:flex-1">
              <span className="text-ink-900 block text-[13px] font-semibold leading-tight sm:text-sm">
                {hub.title}
              </span>
              {/* Fit the subtitle to the space beside the icon, without ellipses. */}
              <span className="text-ink-600 hidden text-xs leading-4 sm:block">
                {hub.key === 'perps' ? (
                  <>
                    <span className="hidden whitespace-nowrap [@container(min-width:90px)_and_(max-width:115.99px)]:block">
                      Stocks &amp; crypto
                    </span>
                    <span className="hidden whitespace-nowrap [@container(min-width:116px)]:block">
                      {hub.subtitle}
                    </span>
                  </>
                ) : (
                  <span
                    className={clsx(
                      'hidden whitespace-nowrap',
                      hub.subtitleClassName
                    )}
                  >
                    {hub.key === 'sports' ? <SportsStatus /> : hub.subtitle}
                  </span>
                )}
              </span>
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
    <span className="flex min-h-[1rem] items-center gap-1">
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
