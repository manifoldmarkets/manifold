import { isAdminId, isModId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { revalidateStaticProps } from 'shared/utils'
import { track } from 'shared/analytics'

const schema = z
  .object({
    dashboardIds: z.array(z.string()),
  })
  .strict()

export const setnews = authEndpoint(async (req, auth) => {
  const { dashboardIds } = validate(schema, req.body)
  if (!dashboardIds.length) {
    return { success: true }
  }

  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'You are not an admin or mod')
  }

  const pg = createSupabaseDirectClient()
  // update all dashboards to be important

  const slugs: { slug: string }[] = await pg.tx(async (t) => {
    await t.none(`update dashboards set importance_score = 0`)

    const queries = dashboardIds.map((id, i) =>
      t.one(
        `update dashboards set importance_score = $2 where id = $1 returning slug`,
        [id, 1 - i / dashboardIds.length]
      )
    )

    return t.batch(queries)
  })

  await Promise.all([
    revalidateStaticProps(`/home`),
    revalidateStaticProps(`/news`),
    ...slugs.map(({ slug }) => revalidateStaticProps(`/news/${slug}`)),
  ])

  track(auth.uid, 'set-news', { dashboardIds })

  return { success: true }
})
