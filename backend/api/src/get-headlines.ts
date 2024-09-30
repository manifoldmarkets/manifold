import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { Headline } from 'common/news'

export const getHeadlines: APIHandler<'headlines'> = async (props) => {
  const { slug } = props
  const pg = createSupabaseDirectClient()
  const columnName = (slug ? `${slug}_` : '') + 'importance_score'
  return await pg
    .manyOrNone<Headline>(
      `select id, slug, title from dashboards where ${columnName} > 0 order by ${columnName} desc`
    )
    .catch((error) => {
      throw new APIError(500, 'Error fetching headlines ' + error.message)
    })
}
