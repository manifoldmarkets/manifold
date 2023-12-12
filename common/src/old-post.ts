import { JSONContent } from '@tiptap/core'
import { Visibility } from './contract'

/** @deprecated */
export type OldPost = {
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
