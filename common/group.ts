import { sortBy } from 'lodash'

export type Group = {
  id: string
  slug: string
  name: string
  about: string
  creatorId: string // User id
  createdTime: number
  mostRecentActivityTime: number
  anyoneCanJoin: boolean
  totalContracts: number
  totalMembers: number
  aboutPostId?: string
  postIds: string[]
  chatDisabled?: boolean
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
}

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
  return sortBy(groups, [
    (group) => -1 * group.totalMembers,
    (group) => -1 * group.totalContracts,
  ])
    .filter((group) => group.anyoneCanJoin)
    .filter((group) =>
      excludeGroups
        ? excludedGroups.every(
            (name) => !group.name.toLowerCase().includes(name)
          )
        : true
    )
    .filter(
      (group) =>
        (group.mostRecentContractAddedTime ?? 0) >
        Date.now() - 1000 * 60 * 60 * 24 * 7
    )
    .slice(0, n)
}
