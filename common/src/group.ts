import { partition, sortBy } from 'lodash'
import { Contract } from './contract'

export type Group = {
  id: string
  slug: string
  name: string
  about: string
  creatorId: string // User id
  createdTime: number
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

export const GroupsByTopic = {
  default: [
    'economics-default',
    'technology-default',
    'science-default',
    'politics-default',
    'world-default',
    'culture-default',
  ],
  destiny: ['destinygg', 'destinygg-stocks', 'daliban-hq'],
  rat: ['effective-altruism', 'sf-bay-rationalists', 'nuclear-risk', 'acx'],
  ai: [
    'ai',
    'technical-ai-timelines',
    'ai-safety',
    'ai-impacts',
    'ai-alignment',
    'gpt4-speculation',
  ],
  ponzi: ['fun', 'selfresolving', 'whale-watching', 'permanent markets'],
  // grey: ['cgp-grey'],
}

export function getGroupLinkToDisplay(contract: Contract) {
  const { groupLinks } = contract
  const sortedGroupLinks = groupLinks?.sort(
    (a, b) => b.createdTime - a.createdTime
  )
  const groupCreatorAdded = sortedGroupLinks?.find(
    (g) => g.userId === contract.creatorId
  )
  const groupToDisplay = groupCreatorAdded
    ? groupCreatorAdded
    : sortedGroupLinks?.[0] ?? null
  return groupToDisplay
}

export function getGroupLinksToDisplay(contract: Contract) {
  const { groupLinks } = contract
  const sortedGroupLinks =
    groupLinks?.sort((a, b) => b.createdTime - a.createdTime) ?? []

  const [groupsCreatorAdded, otherGroups] = partition(
    sortedGroupLinks,
    (g) => g.userId === contract.creatorId
  )
  return [...groupsCreatorAdded, ...otherGroups].slice(0, 3)
}
