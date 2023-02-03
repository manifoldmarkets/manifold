import { beginsWith, searchInAny } from 'common/util/parse'
import { keyBy, orderBy } from 'lodash'

export interface PageData {
  label: string
  slug: string
  keywords?: string[]
}

const pages: PageData[] = [
  { label: 'Home', slug: '/home' },
  { label: 'Notifications', slug: '/notifications' },
  { label: 'Leaderboards', slug: '/leaderboards', keywords: ['top', 'high'] },
  {
    label: 'Create market',
    slug: '/create',
    keywords: ['add', 'make', 'ask'],
  },
  { label: 'Get mana', slug: '/add-funds', keywords: ['buy', 'subscribe'] },
  { label: 'Charity', slug: '/charity', keywords: ['donate', 'for good'] },
  { label: 'Referrals', slug: '/referrals' },
  { label: 'Live Feed', slug: '/live' },

  { label: 'Markets', slug: '/markets' },
  { label: 'Newest', slug: '/search?s=newest&f=open' },
  { label: 'Trending', slug: '/search?s=score&f=open' },
  { label: 'Daily Changed', slug: '/search?s=daily-score&f=open' },
  { label: '24h Volume', slug: '/search?s=24-hour-vol&f=open' },
  {
    label: 'Total Traders',
    slug: '/search?s=most-popular&f=open',
    keywords: ['most popular'],
  },
  { label: 'Closing Soon', slug: '/search?s=close-date&f=open' },
  { label: 'Recently Resolved', slug: '/search?s=resolve-date&f=resolved' },
]

export function searchPages(query: string, limit: number) {
  const filtered = pages.filter((page) => {
    return query.length > 2
      ? searchInAny(query, page.label, ...(page.keywords ?? []))
      : beginsWith(page.label, query)
  })

  return orderBy(
    filtered,
    [(page) => beginsWith(page.label, query)],
    ['desc']
  ).slice(0, limit)
}

const pagesByLabel = keyBy(pages, 'label')

export const defaultPages = [
  pagesByLabel['Newest'],
  pagesByLabel['Daily Changed'],
  pagesByLabel['Trending'],
]
