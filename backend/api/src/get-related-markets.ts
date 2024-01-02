import { APIHandler } from 'api/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { orderBy } from 'lodash'

export const getrelatedmarkets: APIHandler<'get-related-markets'> = async (
  body,
  _,
  { log }
) => {
  const { contractId, limit } = body
  const pg = createSupabaseDirectClient()
  const [marketsFromEmbeddings, groupContracts, topics] = await Promise.all([
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
            and contracts.id != $1
          order by contracts.importance_score desc
          limit $2
          ) gc
        `,
      [contractId, (limit ?? 5) + 15],
      (row) => [row.group_slug, convertContract(row)] as [string, Contract]
    ),
    pg.map(
      `select slug,importance_score from groups where slug = ANY(
              select unnest(group_slugs) as slug
              from contracts
              where id = $1
          )`,
      [contractId],
      (row) => ({
        slug: row.slug as string,
        importance_score: row.importance_score as number,
      })
    ),
  ])

  // Order so we can remove duplicates from less important groups
  const orderedGroupContracts = orderBy(
    groupContracts,
    (gc) => topics.find((g) => g.slug === gc[0])?.importance_score,
    'desc'
  )
  const marketsByTopicSlug = {} as Record<string, Contract[]>
  // Group and remove duplicates
  for (const [slug, contract] of orderedGroupContracts) {
    if (!marketsByTopicSlug[slug]) marketsByTopicSlug[slug] = []
    const addedMarketIds = Object.values(marketsByTopicSlug)
      .flat()
      .map((c) => c.id)
    if (!addedMarketIds.includes(contract.id))
      marketsByTopicSlug[slug].push(contract)
  }
  // Return only the limit for each topic
  for (const slug of topics.map((t) => t.slug)) {
    marketsByTopicSlug[slug] = (marketsByTopicSlug[slug] ?? []).slice(0, limit)
  }
  log('topic slugs found:', Object.keys(marketsByTopicSlug))
  return {
    marketsFromEmbeddings,
    marketsByTopicSlug,
  }
}
