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
  {
    label: 'Groups',
    slug: '/groups',
    keywords: ['create group'], // TODO: this flow is bad
  },
  { label: 'Get mana', slug: '/add-funds', keywords: ['buy', 'subscribe'] },
  { label: 'Charity', slug: '/charity', keywords: ['donate', 'for good'] },
  { label: 'Referrals', slug: '/referrals', keywords: ['invite', 'share'] },
  { label: 'Live feed', slug: '/live' },
  { label: 'About', slug: '/about' },
  { label: 'Ads', slug: '/ad', keywords: ['advertisement'] },

  { label: 'Questions', slug: '/questions' },
  { label: 'Users', slug: '/users' },
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
  pagesByLabel['Users'],
  pagesByLabel['Groups'],
  pagesByLabel['Live feed'],
]
