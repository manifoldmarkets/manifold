import { convertDashboardSqltoTS } from 'common/dashboard'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { Json, MaybeAuthedEndpoint, validate } from './helpers/endpoint'

const bodySchema = z
  .object({
    term: z.string(),
    offset: z.number().gte(0),
    limit: z.number().gt(0),
  })
  .strict()

export const searchDashboards = MaybeAuthedEndpoint(async (req) => {
  const { term, offset, limit } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()

  const searchDashboardSql = getSearchDashboardSQL({ term })
  const dashboards = await pg.map(
    searchDashboardSql,
    [term, limit, offset],
    convertDashboardSqltoTS
  )

  return (dashboards ?? []) as unknown as Json
})

// $1 = term, $2 = limit, $3 = offset
function getSearchDashboardSQL(input: { term: string }) {
  const { term } = input

  let query = ''
  const emptyTerm = term.length === 0

  if (emptyTerm) {
    query = `
        select *
        from dashboards
        where visibility = 'public'
        order by importance_score desc, created_time desc
      `
  } else {
    query = `
        SELECT dashboards.*
        FROM dashboards,
        LATERAL websearch_to_tsquery('english', $1) as query
        WHERE dashboards.title_fts @@ query
        AND visibility <> 'deleted'
        ORDER BY importance_score DESC, created_time DESC
      `
  }
  return query + `LIMIT $2 OFFSET $3`
}
