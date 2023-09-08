import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { contentSchema } from 'shared/zod-types'
import { slugify } from 'common/util/slugify'
import { randomString } from 'common/util/random'

const schema = z.object({
  title: z.string(),
  description: contentSchema.optional(),
})

export const createdashboard = authEndpoint(async (req, auth) => {
  const { title, description } = validate(schema, req.body)

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
    `insert into dashboards(slug, creator_id, description, title)
      values ($1, $2, $3,$4)
      returning id, slug`,
    [slug, auth.uid, description, title]
  )

  // return something
  return { id: id, slug: slug }
})
