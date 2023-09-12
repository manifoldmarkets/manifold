import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { DashboardItemSchema, contentSchema } from 'shared/zod-types'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'

const schema = z.object({
  title: z.string(),
  description: contentSchema.optional(),
  items: z.array(DashboardItemSchema),
})

export const createdashboard = authEndpoint(async (req, auth) => {
  const { title, description, items } = validate(schema, req.body)
  console.log(items)

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

  // create if not exists the group invite link row
  const { id } = await pg.one(
    `insert into dashboards(slug, creator_id, description, title, items)
      values ($1, $2, $3,$4, $5)
      returning id, slug`,
    [slug, auth.uid, description, title, JSON.stringify(items)]
  )

  // return something
  return { id: id, slug: slug }
})
