import {
  Group,
  MAX_ABOUT_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MAX_ID_LENGTH,
  PrivacyStatusType,
} from 'common/group'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsert } from 'shared/supabase/utils'
import { contentSchema } from 'shared/zod-types'

const bodySchema = z.object({
  name: z.string().min(1).max(MAX_GROUP_NAME_LENGTH),
  memberIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)),
  about: contentSchema.or(z.string().min(1).max(MAX_ABOUT_LENGTH)).optional(),
  privacyStatus: z.string().min(1).optional(),
})

export const creategroup = authEndpoint(async (req, auth) => {
  const { name, about, memberIds, privacyStatus } = validate(
    bodySchema,
    req.body
  )

  const creator = await getUser(auth.uid)
  if (!creator)
    throw new APIError(400, 'No user exists with the authenticated user ID.')

  const pg = createSupabaseDirectClient()

  // Add creator id to member ids for convenience
  if (!memberIds.includes(creator.id)) memberIds.push(creator.id)

  console.log(
    'creating group for',
    creator.username,
    'named',
    name,
    'about',
    about,
    'privacy',
    privacyStatus,
    'other member ids',
    memberIds
  )

  const slug = await getSlug(name)

  const groupData: Omit<Group, 'id'> = removeUndefinedProps({
    creatorId: creator.id,
    slug,
    name,
    about: about ?? '',
    createdTime: Date.now(),
    totalMembers: memberIds.length,
    postIds: [],
    privacyStatus: privacyStatus as PrivacyStatusType,
  })

  const group = await pg.one(
    `insert into groups (data) values ($1) returning *`,
    [groupData]
  )

  await bulkInsert(
    pg,
    'group_members',
    memberIds.map((memberId) =>
      removeUndefinedProps({
        group_id: group.id,
        member_id: memberId,
        role: memberId === creator.id ? 'admin' : undefined,
      })
    )
  )

  return { status: 'success', group: group }
})

export const getSlug = async (name: string) => {
  const proposedSlug = slugify(name)
  const exists = await groupExists(proposedSlug)

  return exists ? proposedSlug + '-' + randomString() : proposedSlug
}

// TODO: change to on conflict of uniqueness
export async function groupExists(slug: string) {
  const pg = createSupabaseDirectClient()
  const group = await pg.oneOrNone(`select 1 from groups where slug = $1`, [
    slug,
  ])

  return !!group
}
