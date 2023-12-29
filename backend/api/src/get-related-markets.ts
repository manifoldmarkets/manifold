import { APIHandler } from 'api/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'

export const getrelatedmarkets: APIHandler<'get-related-markets'> = async (
  body,
  _,
  { log }
) => {
  const { contractId, limit } = body
  const pg = createSupabaseDirectClient()
  const [marketsFromEmbeddings, groupContracts] = await Promise.all([
    pg.map(
      `
      select * from close_contract_embeddings(
        input_contract_id := $1,
        match_count := $2,
        similarity_threshold := 0.7
        )`,
      [contractId, limit],
      (row) => row.data as Contract
    ),
    pg.map(
      `
      with group_slug_array as (
        select unnest(group_slugs) as slug
        from contracts
        where id = $1
      )
      select gsa.slug as group_slug, gc.data, gc.importance_score
      from group_slug_array gsa
      cross join lateral (
          select *
          from contracts
          where gsa.slug = ANY(contracts.group_slugs)
            and contracts.visibility = 'public'
          order by contracts.importance_score desc
          limit $2
          ) gc
        `,
      [contractId, limit ?? 10],
      (row) => [row.group_slug, convertContract(row)] as [string, Contract]
    ),
  ])
  const marketsByTopicSlug = {} as Record<string, Contract[]>
  for (const [slug, contract] of groupContracts) {
    if (!marketsByTopicSlug[slug]) marketsByTopicSlug[slug] = []
    marketsByTopicSlug[slug].push(contract)
  }
  log('topic slugs found:', Object.keys(marketsByTopicSlug))
  return {
    marketsFromEmbeddings,
    marketsByTopicSlug,
  }
}
