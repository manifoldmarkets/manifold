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
      with ranked_contracts as (
        select gc.group_id, c.data, c.importance_score,
          rank() over (partition by gc.group_id order by c.importance_score desc) as n
        from contracts as c
        join group_contracts as gc on c.id = gc.contract_id
        where gc.group_id in (select group_id from group_contracts where contract_id = $1)
      )
      select g.slug as group_slug, rc.data, rc.importance_score
      from ranked_contracts as rc
      join groups as g on rc.group_id = g.id
      where rc.n <= $2
      order by g.slug, rc.n
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
