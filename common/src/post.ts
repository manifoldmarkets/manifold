import { JSONContent } from '@tiptap/core'
import { Visibility } from './contract'

export type Post = {
  id: string
  type?: string
  title: string
  /** @deprecated */
  subtitle?: string
  content: JSONContent
  creatorId: string // User id
  createdTime: number
  slug: string

  // denormalized user fields
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string

  likedByUserIds?: string[]
  likedByUserCount?: number

  /** @deprecated */
  commentCount?: number
  /** @deprecated */
  isGroupAboutPost?: boolean
  groupId?: string
  featuredLabel?: string
  visibility: Visibility
}

export type DateDoc = Post & {
  bounty: number
  birthday: number
  type: 'date-doc'
  contractSlug: string
}

export const MAX_POST_TITLE_LENGTH = 480
