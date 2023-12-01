import { Row } from './supabase/utils'
import { JSONContent } from '@tiptap/core'

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
  importanceScore: number
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
  return `/browse?${TOPIC_KEY}=${groupSlug}`
}

// note: changing these breaks old urls. if you do, make sure to update omnisearch and opensearch.xml
export const TOPIC_KEY = 'topic'
export const DEFAULT_TOPIC = ''
export type GroupRole = 'admin' | 'moderator' | 'member'
