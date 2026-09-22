import { z } from 'zod'
import { Contract } from './contract'
import { DisplayUser } from './api/user-types'
import { FIREBASE_CONFIG } from './envs/constants'
import {
  SocialRichContent,
  socialRichContentDisplaySchema,
  socialRichContentSchema,
  socialRichContentToText,
} from './social-rich-content'

export const SOCIAL_POST_MAX_LENGTH = 2000
export const SOCIAL_POST_MAX_MARKETS = 5
export const SOCIAL_POST_MAX_IMAGES = 4
export const SOCIAL_FEED_PAGE_SIZE = 10

// Match the download URLs returned by uploadPublicImage, including the bucket.
// Trusting the Firebase hostname alone would allow attacker-owned buckets.
export function isSocialImageUrl(value: string) {
  try {
    const url = new URL(value)
    const prefix = `/v0/b/${FIREBASE_CONFIG.storageBucket}/o/`
    if (
      url.origin !== 'https://firebasestorage.googleapis.com' ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(prefix) ||
      url.searchParams.get('alt') !== 'media'
    )
      return false
    const object = url.pathname.slice(prefix.length)
    return (
      !object.includes('/') &&
      /^user-images\/[^/]+\/.+$/.test(decodeURIComponent(object))
    )
  } catch {
    return false
  }
}

const createSocialPostDraftSchema = (forEditing: boolean) =>
  z
    .object({
      text: z.string().trim(),
      richContent: (forEditing
        ? socialRichContentDisplaySchema
        : socialRichContentSchema
      )
        .nullable()
        .optional(),
      marketIds: z
        .array(z.string().min(1).max(200))
        .max(SOCIAL_POST_MAX_MARKETS)
        .default([]),
      imageUrls: z
        .array(
          z.string().url().max(2048).refine(isSocialImageUrl, {
            message: 'Images must be uploaded to Manifold storage',
          })
        )
        .max(SOCIAL_POST_MAX_IMAGES)
        .optional(),
    })
    .strict()
    .transform((content) => ({
      ...content,
      text: content.richContent
        ? socialRichContentToText(content.richContent)
        : content.text,
    }))
    .superRefine(({ text, richContent, marketIds }, ctx) => {
      // Edits restore unavailable references before enforcing the stored length.
      if (
        (!forEditing || !richContent) &&
        [...text].length > SOCIAL_POST_MAX_LENGTH
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Posts can contain up to 2,000 characters',
        })
      if (new Set(marketIds).size !== marketIds.length)
        ctx.addIssue({ code: 'custom', message: 'Markets must be unique' })
    })
export const socialPostDraftSchema = createSocialPostDraftSchema(false)
export const socialPostEditSchema = createSocialPostDraftSchema(true)
export const hasSocialPostContent = (
  content: z.infer<typeof socialPostDraftSchema>
) => !!(content.text || content.marketIds.length || content.imageUrls?.length)
export const socialPostContentSchema = socialPostDraftSchema.refine(
  hasSocialPostContent,
  'Add text, a market, or an image'
)
export const socialPostSourceSchema = z.union([
  z
    .object({
      contractId: z.string().min(1).max(200),
      commentId: z.string().min(1).max(200).optional(),
      betId: z.string().min(1).max(200).optional(),
    })
    .strict(),
  z.object({ postId: z.string().min(1).max(200) }).strict(),
])

export type SocialQuote = {
  kind: 'comment' | 'bet' | 'market' | 'post'
  url: string
  text: string
  richContent?: SocialRichContent | null
  author?: DisplayUser
  contractId?: string
  imageUrls?: string[]
  markets?: Contract[]
  includesQuote?: boolean
  unavailable?: boolean
}

export type SocialPostSource = z.infer<typeof socialPostSourceSchema>
export type SocialPost = {
  id: string
  author: DisplayUser
  text: string
  richContent?: SocialRichContent | null
  createdTimeMs: number
  createdTime: string
  editedTimeMs: number | null
  editedTime: string | null
  parentAuthor: DisplayUser | null
  parentId: string | null
  rootId: string
  removed: 'author' | 'moderator' | 'blocked' | null
  markets: Contract[]
  imageUrls?: string[]
  unavailableMarketCount: number
  source: SocialQuote | null
  likeCount: number
  liked: boolean
  replyCount: number
  canReply: boolean
  replyPreviews: SocialPost[]
}
export type SocialPostPage = { posts: SocialPost[]; nextCursor: string | null }
export type SocialPostDetail = {
  post: SocialPost
  ancestors: SocialPost[]
  // Only included for the author on an uncached, live post detail response.
  editContent?: SocialRichContent | null
}
export type SocialLikerPage = {
  users: DisplayUser[]
  nextCursor: string | null
}
export const socialCursorSchema = z
  .string()
  .max(300)
  .refine((s) => {
    const [time, id, extra] = s.split('|')
    return (
      !extra &&
      !!id &&
      /^[a-zA-Z0-9_-]+$/.test(id) &&
      /^\d{4}-\d\d-\d\d[T ]/.test(time) &&
      Number.isFinite(Date.parse(time))
    )
  }, 'Invalid cursor')
export const socialPostPath = (id: string) => `/yap/${id}`

// Preserve PostgreSQL microseconds while emitting browser-compatible ISO dates.
export const socialTimestamp = (timestamp: string) =>
  timestamp.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')

// Display dates use milliseconds; cursor dates retain PostgreSQL precision.
export const socialTimestampMillis = (timestamp: string) =>
  Date.parse(socialTimestamp(timestamp).replace(/(\.\d{3})\d+/, '$1'))

// Quote one level of content. Reposts of reposts link back to the original
// discussion rather than expanding an arbitrarily deep chain in the timeline.
export const quoteSocialPost = (post: SocialPost): SocialQuote => ({
  kind: 'post',
  url: socialPostPath(post.id),
  text: post.removed ? '' : post.text,
  ...(post.richContent
    ? { richContent: post.removed ? null : post.richContent }
    : {}),
  author: post.removed ? undefined : post.author,
  imageUrls: post.removed ? [] : post.imageUrls,
  markets: post.removed ? [] : post.markets,
  includesQuote:
    !post.removed && !!post.source && post.source.kind !== 'market',
  unavailable: !!post.removed,
})
