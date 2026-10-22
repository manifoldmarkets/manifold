import {
  LibraryIcon,
  NewspaperIcon,
  TrendingUpIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { TbBallBasketball } from 'react-icons/tb'

import { track } from 'web/lib/service/analytics'

type Hub = {
  key: 'election' | 'perps' | 'sports' | 'news'
  href: string
  title: string
  shortTitle?: string
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
    title: '2026 Midterms',
    shortTitle: 'Midterms',
    subtitle: 'Live odds on every race',
    icon: LibraryIcon,
    className:
      'from-blue-100 to-rose-100 dark:from-blue-900/50 dark:to-rose-900/50',
    iconClassName: 'text-blue-700 dark:text-blue-300',
  },
  {
    key: 'perps',
    href: '/perps',
    title: 'Perps',
    subtitle: 'Trade live prices with leverage',
    icon: TrendingUpIcon,
    className:
      'from-teal-100 to-indigo-100 dark:from-teal-900/50 dark:to-indigo-900/50',
    iconClassName: 'text-teal-700 dark:text-teal-300',
  },
  {
    key: 'sports',
    href: '/sports',
    title: 'Sports',
    subtitle: 'Live games, props and odds',
    icon: TbBallBasketball,
    className:
      'from-amber-100 to-lime-100 dark:from-amber-900/50 dark:to-lime-900/50',
    iconClassName: 'text-amber-700 dark:text-amber-300',
  },
  {
    key: 'news',
    href: '/news',
    title: 'News',
    subtitle: 'Stories with live markets',
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
              'ring-ink-200 relative flex min-w-0 flex-col items-center gap-0.5 rounded-xl bg-gradient-to-br px-1.5 py-1.5 text-center ring-1 transition-all hover:brightness-105',
              'focus-visible:ring-primary-500 outline-none focus-visible:ring-2',
              'md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-left',
              hub.className
            )}
          >
            {hub.beta && (
              <span className="absolute right-1.5 top-1.5 rounded bg-violet-600 px-1 py-px text-[9px] font-bold uppercase leading-tight tracking-wide text-white md:static md:order-last md:ml-auto md:self-start">
                Beta
              </span>
            )}
            <span className="bg-canvas-0/70 flex h-6 w-6 shrink-0 items-center justify-center rounded-full md:h-9 md:w-9">
              <Icon
                className={clsx('h-4 w-4 md:h-5 md:w-5', hub.iconClassName)}
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-ink-900 text-[13px] font-semibold leading-tight md:truncate md:text-sm">
                {hub.shortTitle ? (
                  <>
                    <span className="lg:hidden">{hub.shortTitle}</span>
                    <span className="hidden lg:inline">{hub.title}</span>
                  </>
                ) : (
                  hub.title
                )}
              </span>
              <span className="text-ink-600 hidden truncate text-xs md:block">
                {hub.subtitle}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
