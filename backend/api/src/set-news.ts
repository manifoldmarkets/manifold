import { ENV_CONFIG, isAdminId, isModId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { revalidateCachedTag, revalidateStaticProps } from 'shared/utils'
import { track } from 'shared/analytics'

export const setnews: APIHandler<'set-news'> = async (props, auth, { log }) => {
  const { dashboardIds, isPolitics } = props
  log('set-news', { dashboardIds, isPolitics })

  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'You are not an admin or mod')
  }

  const pg = createSupabaseDirectClient()
  // update all dashboards to be important

  const slugs: { slug: string }[] = await pg.tx(async (t) => {
    await t.none(
      isPolitics
        ? `update dashboards
                    set politics_importance_score = 0`
        : `update dashboards
                    set importance_score = 0`
    )
    if (dashboardIds.length === 0) return []
    const queries = dashboardIds.map((id, i) =>
      t.one(
        isPolitics
          ? `update dashboards set politics_importance_score = $2 where id = $1 returning slug`
          : `update dashboards set importance_score = $2 where id = $1 returning slug`,
        [id, 1 - i / dashboardIds.length]
      )
    )

    return t.batch(queries)
  })

  await Promise.all(
    isPolitics
      ? [revalidateCachedTag('politics-headlines', ENV_CONFIG.politicsDomain)]
      : [
          revalidateStaticProps(`/home`),
          revalidateStaticProps(`/news`),
          ...slugs.map(({ slug }) => revalidateStaticProps(`/news/${slug}`)),
        ]
  )

  track(auth.uid, 'set-news', { dashboardIds })

  return { success: true }
}
