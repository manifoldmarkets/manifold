import { Row } from './supabase/utils'
import { JSONContent } from '@tiptap/core'
import { z, ZodRawShape } from 'zod'
import { contentSchema, coerceBoolean } from './api/zod-types'

export type Group = {
  id: string
  slug: string
  name: string
  about?: string | JSONContent
  creatorId: string // User id
  createdTime: number // native col only
  totalMembers: number // native col only
  bannerUrl?: string
  privacyStatus: PrivacyStatusType
  importanceScore: number // native col only
}

export type GroupResponse = Row<'groups'>

export type PrivacyStatusType = 'public' | 'curated'
export const MAX_GROUP_NAME_LENGTH = 75
// export const MAX_ABOUT_LENGTH = 140
export const MAX_ID_LENGTH = 60
export const MAX_GROUPS_PER_MARKET = 5

export const GroupAboutSchema = contentSchema.or(z.string())

export const GroupNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(MAX_GROUP_NAME_LENGTH)

export type Topic = LiteGroup
export type LiteGroup = Pick<
  Group,
  'id' | 'slug' | 'name' | 'importanceScore' | 'privacyStatus' | 'totalMembers'
>

export function groupPath(groupSlug: string) {
  return `/browse/${groupSlug}`
}

// note: changing these breaks old urls. if you do, make sure to update omnisearch and opensearch.xml
export const TOPIC_KEY = 'topic'
export const DEFAULT_TOPIC = ''
export type GroupRole = 'admin' | 'moderator' | 'member'

export const SearchGroupParams = (shape: ZodRawShape) =>
  z.object(shape).strict()

export const MySearchGroupShape = {
  term: z.string(),
  offset: z.coerce.number().gte(0).default(0),
  limit: z.coerce.number().gt(0),
  addingToContract: coerceBoolean.optional(),
  type: z.enum(['full', 'lite']).default('full'),
}
export const SearchGroupShape = {
  ...MySearchGroupShape,
  memberGroupsOnly: coerceBoolean.optional(),
}
