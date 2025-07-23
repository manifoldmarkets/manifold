import { Visibility } from './contract'

import { JSONContent } from '@tiptap/core'
import { ENV_CONFIG } from './envs/constants'
import { convertSQLtoTS, Row } from './supabase/utils'
import { referralQuery } from './util/share'

export type TopLevelPost = {
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
  unlistedById?: string
  isAnnouncement?: boolean
  isChangeLog?: boolean
  boosted: boolean
  /** @deprecated - not deprecated, only updated in native column though*/
  importanceScore: number
  /** @deprecated - not deprecated, only available via the get-posts endpoint*/
  uniqueUsers?: number
  /** @deprecated - not deprecated, only available via the get-posts endpoint*/
  lastCommentTime?: number | null
}

export const convertPost = (sqlPost: Row<'old_posts'>) =>
  convertSQLtoTS<'old_posts', TopLevelPost>(sqlPost, {
    created_time: false, // grab from data
  })

export const getPostShareUrl = (
  post: TopLevelPost,
  username: string | undefined
) =>
  `https://${ENV_CONFIG.domain}/post/${post.slug}${
    username ? referralQuery(username) : ''
  }`
export const getPostCommentShareUrl = (post: TopLevelPost, commentId: string) =>
  `https://${ENV_CONFIG.domain}/post/${post.slug}#${commentId}`
