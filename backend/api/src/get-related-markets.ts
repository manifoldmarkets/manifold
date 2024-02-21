import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { orderAndDedupeGroupContracts } from 'api/helpers/groups'

export const getrelatedmarkets: APIHandler<'get-related-markets'> = async (
  body,
  _,
  { log }
) => {
  const { contractId, limit, limitTopics } = body
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
      with group_slugs as (
        select slug
        from groups as g
        join group_contracts as gc on g.id = gc.group_id
        where contract_id = $1
      )
      select gs.slug, c.data, c.importance_score
      from group_slugs as gs
      cross join lateral (
        select c.data, c.importance_score
        from contracts as c
        where c.id != $1 and c.visibility = 'public' and c.deleted = FALSE and c.group_slugs @> array[gs.slug]
        order by c.importance_score desc
        limit $2
      ) as c
      order by gs.slug, c.importance_score desc
      `,
      [contractId, (limit ?? 5) + 15],
      (row) => [row.slug, convertContract(row)] as [string, Contract]
    ),
    pg.map(
      `select slug,importance_score from groups where slug = ANY(
              select unnest(group_slugs) as slug
              from contracts
              where id = $1
              )
              order by importance_score desc
          `,
      [contractId],
      (row) => ({
        slug: row.slug as string,
        importanceScore: row.importance_score as number,
      })
    ),
  ])

  const marketsByTopicSlug = orderAndDedupeGroupContracts(
    topics,
    groupContracts
  )

  // Return only the limit for each topic
  let topicCount = 0
  for (const slug of topics.map((t) => t.slug)) {
    if (topicCount > limitTopics) delete marketsByTopicSlug[slug]
    else
      marketsByTopicSlug[slug] = (marketsByTopicSlug[slug] ?? []).slice(
        0,
        limit
      )
    topicCount++
  }
  log('returning topic slugs', { slugs: Object.keys(marketsByTopicSlug) })
  log('topics to importance scores', { topics })
  return {
    marketsFromEmbeddings,
    marketsByTopicSlug,
  }
}
