import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/outline'

export const GUIDELINE_SECTIONS = [
  {
    title: 'Accounts & Market Manipulation',
    href: '/community-guidelines/accounts',
  },
  {
    title: 'Bots',
    href: '/community-guidelines/bots',
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
    title: 'Leagues',
    href: '/community-guidelines/leagues',
  },
  {
    title: 'Comment Guidelines',
    href: '/community-guidelines/comment-guidelines',
  },
  {
    title: 'Platform Conduct',
    href: '/community-guidelines/platform-conduct',
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
  const next = i < GUIDELINE_SECTIONS.length - 1 ? GUIDELINE_SECTIONS[i + 1] : null

  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex items-center gap-3 rounded-xl border-2 border-ink-200 bg-canvas-0 p-4 transition hover:border-primary-300"
        >
          <ChevronLeftIcon className="h-5 w-5 shrink-0 text-ink-400 group-hover:text-primary-500" />
          <div className="min-w-0">
            <div className="text-xs text-ink-500">Previous</div>
            <div className="truncate text-sm font-medium text-ink-1000">{prev.title}</div>
          </div>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex items-center justify-end gap-3 rounded-xl border-2 border-ink-200 bg-canvas-0 p-4 text-right transition hover:border-primary-300"
        >
          <div className="min-w-0">
            <div className="text-xs text-ink-500">Next</div>
            <div className="truncate text-sm font-medium text-ink-1000">{next.title}</div>
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-400 group-hover:text-primary-500" />
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
    </div>
  )
}
