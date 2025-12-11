import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  join,
  limit,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { type APIHandler } from './helpers/endpoint'

export const searchContractPositions: APIHandler<
  'search-contract-positions'
> = async (props) => {
  const { term, contractId, limit } = props
  const pg = createSupabaseDirectClient()
  const query = getSearchUserSQL(term, limit, contractId)
  const users = await pg.manyOrNone(query)
  return users
}

function getSearchUserSQL(term: string, lim: number, contractId: string) {
  // Use ILIKE for simple substring matching - works better for names/usernames
  // since full-text search has issues with stopwords and partial word matching
  const search = renderSql(
    select(
      `users.id, name, username, users.data->>'avatarUrl' as "avatarUrl", users.data->'isBannedFromPosting' as "isBannedFromPosting"`
    ),
    from('users'),
    join('user_contract_metrics ucm on ucm.user_id = users.id'),
    where('ucm.contract_id = $1', [contractId]),
    where('ucm.answer_id is null'),
    term
      ? [
          where(`(name ilike $1 or username ilike $1)`, [`%${term}%`]),
          orderBy(
            `
            case when username ilike $1 then 0 else 1 end,
            case when name ilike $2 then 0 else 1 end,
            users.data->>'lastBetTime' desc nulls last
          `,
            [`${term}%`, `${term}%`]
          ),
        ]
      : orderBy(`users.data->'creatorTraders'->'allTime' desc nulls last`),
    limit(lim)
  )
  return search
}
