import { sortBy } from 'lodash'

export type Group = {
  id: string
  slug: string
  name: string
  about: string
  creatorId: string // User id
  createdTime: number
  mostRecentActivityTime: number
  anyoneCanJoin?: boolean
  totalContracts: number
  totalMembers: number
  aboutPostId?: string
  postIds: string[]
  mostRecentContractAddedTime?: number
  cachedLeaderboard?: {
    topTraders: {
      userId: string
      score: number
    }[]
    topCreators: {
      userId: string
      score: number
    }[]
  }
  pinnedItems: { itemId: string; type: 'post' | 'contract' }[]
  bannerUrl?: string
  privacyStatus: PrivacyStatusType
}

export type PrivacyStatusType = 'public' | 'curated' | 'private'
export const MAX_GROUP_NAME_LENGTH = 75
export const MAX_ABOUT_LENGTH = 140
export const MAX_ID_LENGTH = 60
export const NEW_USER_GROUP_SLUGS = ['updates', 'bugs', 'welcome']
export const GROUP_CHAT_SLUG = 'chat'

export type GroupLink = {
  slug: string
  name: string
  groupId: string
  createdTime: number
  userId?: string
}

export type GroupContractDoc = { contractId: string; createdTime: number }
export type GroupMemberDoc = { userId: string; createdTime: number }

const excludedGroups = [
  'features',
  'personal',
  'private',
  'nomic',
  'proofnik',
  'free money',
  'motivation',
  'sf events',
  'please resolve',
  'short-term',
  'washifold',
]

export function filterTopGroups(
  groups: Group[],
  n = 100,
  excludeGroups = true
) {
  return sortBy(
    groups,
    (group) =>
      -(group.totalMembers + group.totalContracts) *
      ((group.mostRecentContractAddedTime ?? 0) >
      Date.now() - 1000 * 60 * 60 * 24 * 7
        ? 2
        : 1)
  )
    .filter((group) => group.anyoneCanJoin)
    .filter((group) =>
      excludeGroups
        ? excludedGroups.every(
            (name) => !group.name.toLowerCase().includes(name)
          )
        : true
    )
    .slice(0, n)
}

export function groupPath(
  groupSlug: string,
  subpath?:
    | 'edit'
    | 'markets'
    | 'about'
    | typeof GROUP_CHAT_SLUG
    | 'leaderboards'
    | 'posts'
) {
  return `/group/${groupSlug}${subpath ? `/${subpath}` : ''}`
}
