import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/outline'

export const GUIDELINE_SECTIONS = [
  {
    title: 'Platform Conduct',
    href: '/community-guidelines/platform-conduct',
  },
  {
    title: 'Accounts & Market Manipulation',
    href: '/community-guidelines/accounts',
  },
  {
    title: 'Running a Market',
    href: '/community-guidelines/running-a-market',
  },
  {
    title: 'Resolving Markets',
    href: '/community-guidelines/resolving-markets',
  },
  {
    title: 'Market Policies',
    href: '/community-guidelines/market-policies',
  },
  {
    title: 'Comment Guidelines',
    href: '/community-guidelines/comment-guidelines',
  },
  {
    title: 'Leagues',
    href: '/community-guidelines/leagues',
  },
  {
    title: 'Bots',
    href: '/community-guidelines/bots',
  },
  {
    title: 'Moderation',
    href: '/community-guidelines/moderation',
  },
  {
    title: 'Prize Drawings',
    href: '/community-guidelines/prize-drawings-faq',
  },
] as const

export function SectionNav({ currentHref }: { currentHref: string }) {
  const i = GUIDELINE_SECTIONS.findIndex((s) => s.href === currentHref)
  if (i === -1) return null
  const prev = i > 0 ? GUIDELINE_SECTIONS[i - 1] : null
  const next =
    i < GUIDELINE_SECTIONS.length - 1 ? GUIDELINE_SECTIONS[i + 1] : null

  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="border-ink-200 bg-canvas-0 hover:border-primary-300 group flex items-center gap-3 rounded-xl border-2 p-4 transition"
        >
          <ChevronLeftIcon className="text-ink-400 group-hover:text-primary-500 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <div className="text-ink-500 text-xs">Previous</div>
            <div className="text-ink-1000 truncate text-sm font-medium">
              {prev.title}
            </div>
          </div>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="border-ink-200 bg-canvas-0 hover:border-primary-300 group flex items-center justify-end gap-3 rounded-xl border-2 p-4 text-right transition"
        >
          <div className="min-w-0">
            <div className="text-ink-500 text-xs">Next</div>
            <div className="text-ink-1000 truncate text-sm font-medium">
              {next.title}
            </div>
          </div>
          <ChevronRightIcon className="text-ink-400 group-hover:text-primary-500 h-5 w-5 shrink-0" />
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
    </div>
  )
}
