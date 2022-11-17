import { JSONContent } from '@tiptap/core'

export type Post = {
  id: string
  title: string
  subtitle: string
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

  commentCount?: number
  isGroupAboutPost?: boolean
  featuredLabel?: string
}

export type DateDoc = Post & {
  bounty: number
  birthday: number
  type: 'date-doc'
  contractSlug: string
}

export const MAX_POST_TITLE_LENGTH = 480
export const MAX_POST_SUBTITLE_LENGTH = 480
