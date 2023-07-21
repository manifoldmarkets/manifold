import { Contract } from './contract'
import { Row } from './supabase/utils'
import { JSONContent } from '@tiptap/core'
import { first, partition } from 'lodash'

export type Group = {
  id: string
  slug: string
  name: string
  about?: string | JSONContent
  creatorId: string // User id
  createdTime: number
  anyoneCanJoin?: boolean
  totalMembers: number
  postIds: string[]
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
  bannerUrl?: string
  privacyStatus: PrivacyStatusType
}

export type GroupResponse = Row<'groups'>

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
  /** @deprecated */
  userId?: string
}

export function groupPath(groupSlug: string) {
  return `/group/${groupSlug}`
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
  return first(sortGroups(contract))
}

export const sortGroups = (contract: Contract) => {
  const { groupLinks } = contract

  const sortedGroupLinks =
    groupLinks?.sort((a, b) => b.createdTime - a.createdTime) ?? []

  const [groupsCreatorAdded, otherGroups] = partition(
    sortedGroupLinks,
    (g) => g.userId === contract.creatorId
  )
  return [...groupsCreatorAdded, ...otherGroups]
}
