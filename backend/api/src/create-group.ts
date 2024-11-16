import {
  Group,
  GroupAboutSchema,
  GroupNameSchema,
  MAX_ID_LENGTH,
} from 'common/group'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { log, getUser } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsert, insert } from 'shared/supabase/utils'
import { convertGroup } from 'common/supabase/groups'

const bodySchema = z
  .object({
    name: GroupNameSchema,
    memberIds: z.array(z.string().min(1).max(MAX_ID_LENGTH)),
    about: GroupAboutSchema.optional(),
    privacyStatus: z.enum(['public', 'curated']),
  })
  .strict()

export const creategroup = authEndpoint(async (req, auth) => {
  const { name, about, memberIds, privacyStatus } = validate(
    bodySchema,
    req.body
  )

  const creator = await getUser(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')

  const pg = createSupabaseDirectClient()

  // Add creator id to member ids for convenience
  if (!memberIds.includes(creator.id)) memberIds.push(creator.id)

  const existingName = await pg.oneOrNone(
    `select 1 from groups where name = $1`,
    [name]
  )
  if (existingName) {
    throw new APIError(400, `The group ${name} already exists`)
  }

  log('creating group ', {
    creatorId: creator.id,
    name,
    about,
    privacyStatus,
    memberIds,
  })

  const slug = await getSlug(name)

  const group = await insert(pg, 'groups', {
    creator_id: creator.id,
    slug,
    name,
    about,
    total_members: memberIds.length,
    privacy_status: privacyStatus,
  })

  await bulkInsert(
    pg,
    'group_members',
    memberIds.map((memberId) => ({
      group_id: group.id,
      member_id: memberId,
      role: memberId === creator.id ? 'admin' : 'member',
    }))
  )

  return { status: 'success', group: convertGroup(group) }
})

// we still need to do this because groups with different names may slugify the same
export const getSlug = async (name: string) => {
  const proposedSlug = slugify(name)
  const exists = await groupExists(proposedSlug)

  return exists ? proposedSlug + '-' + randomString() : proposedSlug
}

async function groupExists(slug: string) {
  const pg = createSupabaseDirectClient()
  const group = await pg.oneOrNone(`select 1 from groups where slug = $1`, [
    slug,
  ])

  return !!group
}
