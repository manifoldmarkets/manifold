import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'
import { updateDashboardGroups } from 'shared/supabase/dashboard'

const schema = z.object({
  title: z.string(),
  description: contentSchema.optional(),
  items: z.array(DashboardItemSchema),
  topics: z.array(z.string()),
})

export const createdashboard = authEndpoint(async (req, auth) => {
  const { title, description, items, topics } = validate(schema, req.body)

  log('creating dashboard')
  const pg = createSupabaseDirectClient()

  let slug = slugify(title)
  const data = await pg.manyOrNone(
    `select slug from dashboards where slug = $1`,
    [slug]
  )

  if (data && data.length > 0) {
    slug = `${slug}-${randomString(8)}`
  }

  const { data: user } = await pg.one(`select data from users where id = $1`, [
    auth.uid,
  ])

  // create if not exists the group invite link row
  const { id } = await pg.one(
    `insert into dashboards(slug, creator_id, description, title, items, creator_username, creator_name, creator_avatar_url)
      values ($1, $2, $3,$4, $5, $6, $7, $8)
      returning id, slug`,
    [
      slug,
      auth.uid,
      description,
      title,
      JSON.stringify(items),
      user.username,
      user.name,
      user.avatarUrl,
    ]
  )

  await pg.tx((txn) => updateDashboardGroups(id, topics, txn))

  // return something
  return { id: id, slug: slug }
})
