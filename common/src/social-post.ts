import { z } from 'zod'
import { Contract } from './contract'
import { DisplayUser } from './api/user-types'

export const SOCIAL_POST_MAX_LENGTH = 2000
export const SOCIAL_POST_MAX_MARKETS = 5
export const SOCIAL_POST_MAX_IMAGES = 4
export const socialPostContentSchema = z
  .object({
    text: z
      .string()
      .trim()
      .refine(
        (s) => [...s].length <= SOCIAL_POST_MAX_LENGTH,
        'Posts can contain up to 2,000 characters'
      ),
    marketIds: z
      .array(z.string().min(1).max(200))
      .max(SOCIAL_POST_MAX_MARKETS)
      .default([]),
    imageUrls: z
      .array(
        z
          .string()
          .url()
          .max(2048)
          .refine((url) => url.startsWith('https://'), {
            message: 'Images must use HTTPS URLs',
          })
      )
      .max(SOCIAL_POST_MAX_IMAGES)
      .optional(),
  })
  .strict()
  .superRefine(({ text, marketIds, imageUrls }, ctx) => {
    if (!text && !marketIds.length && !imageUrls?.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Add text, a market, or an image',
      })
    if (new Set(marketIds).size !== marketIds.length)
      ctx.addIssue({ code: 'custom', message: 'Markets must be unique' })
  })
export const socialPostSourceSchema = z
  .object({
    contractId: z.string().min(1).max(200),
    commentId: z.string().min(1).max(200).optional(),
    betId: z.string().min(1).max(200).optional(),
  })
  .strict()
export type SocialPostSource = z.infer<typeof socialPostSourceSchema>
export type SocialPost = {
  id: string
  author: DisplayUser
  text: string
  createdTime: string
  editedTime: string | null
  parentAuthor: DisplayUser | null
  parentId: string | null
  rootId: string
  removed: 'author' | 'moderator' | 'blocked' | null
  markets: Contract[]
  imageUrls?: string[]
  unavailableMarketCount: number
  source: { url: string; text: string } | null
  likeCount: number
  liked: boolean
  replyCount: number
  canReply: boolean
  replyPreviews: SocialPost[]
}
export type SocialPostPage = { posts: SocialPost[]; nextCursor: string | null }
export type SocialPostDetail = { post: SocialPost; ancestors: SocialPost[] }
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
