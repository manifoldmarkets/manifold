import { APIHandler } from 'api/helpers/endpoint'
import { convertContract } from 'common/supabase/contracts'
import { MAX_WATCHED_MARKETS } from 'common/watched-markets'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getWatchedMarkets: APIHandler<'get-watched-markets'> = async (
  props
) => {
  const { userId, term, limit, offset } = props
  const pg = createSupabaseDirectClient()

  const cleanTerm = term?.trim()
  const { total_count: totalCount } = cleanTerm
    ? await pg.one<{ total_count: number }>(
        `select count(*)::int as total_count
         from (
           select 1
           from contract_follows cf
           join contracts c on c.id = cf.contract_id
           where cf.follow_id = $1
             and c.question ilike '%' || $2 || '%'
           limit $3
         ) t`,
        [userId, cleanTerm, MAX_WATCHED_MARKETS]
      )
    : await pg.one<{ total_count: number }>(
        `select count(*)::int as total_count
         from contract_follows
         where follow_id = $1`,
        [userId]
      )

  if (offset >= MAX_WATCHED_MARKETS || limit === 0) {
    return { contracts: [], totalCount }
  }

  const effectiveLimit = Math.min(limit, MAX_WATCHED_MARKETS - offset)
  const contracts = await pg.map(
    `select c.data
     from contract_follows cf
     join contracts c on c.id = cf.contract_id
     where cf.follow_id = $1
       and ($2 is null or c.question ilike '%' || $2 || '%')
     order by cf.created_time desc
     limit $3 offset $4`,
    [userId, cleanTerm || null, effectiveLimit, offset],
    convertContract
  )

  return { contracts, totalCount }
}
