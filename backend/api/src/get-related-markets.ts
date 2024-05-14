import { APIHandler } from 'api/helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { orderAndDedupeGroupContracts } from 'api/helpers/groups'
import { log } from 'shared/utils'
import { getContractsDirect } from 'shared/supabase/contracts'
import { HOUR_MS } from 'common/util/time'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'
import { ValidatedAPIParams } from 'common/api/schema'
import { mapValues, orderBy } from 'lodash'

export const getrelatedmarketscache: APIHandler<
  'get-related-markets-cache'
> = async (body) => {
  return getRelatedMarkets(body)
}
type cacheType = {
  marketIdsFromEmbeddings: string[]
  marketIdsByTopicSlug: Record<string, string[]>
  lastUpdated: number
}
const cachedRelatedMarkets = new Map<string, cacheType>()

// We cache the state of the contracts every 5 minutes via the cache header,
// and the actual contracts to include for an hour via the internal cachedRelatedMarkets.
const getRelatedMarkets = async (
  body: ValidatedAPIParams<'get-related-markets-cache'>
) => {
  const { contractId, limit, limitTopics, embeddingsLimit } = body
  log('getting related markets', { contractId, limit, limitTopics })
  const pg = createSupabaseDirectClient()
  const cachedResults = cachedRelatedMarkets.get(contractId)
  if (cachedResults && cachedResults.lastUpdated > Date.now() - HOUR_MS) {
    return refreshedRelatedMarkets(contractId, cachedResults, pg)
  }
  const groupsToIgnore = [UNSUBSIDIZED_GROUP_ID, UNRANKED_GROUP_ID]
  const [marketsFromEmbeddings, groupContracts, topics] = await Promise.all([
    pg.map(
      `
      select * from close_contract_embeddings(
        input_contract_id := $1,
        match_count := $2,
        similarity_threshold := 0.7
        )`,
      [contractId, embeddingsLimit],
      (row) => row.data as Contract
    ),
    pg.map(
      `
      with group_slugs as (
        select slug
        from groups as g
        join group_contracts as gc on g.id = gc.group_id
        where contract_id = $1
        and g.id not in (select unnest($3::text[]))
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
      [contractId, (limit ?? 5) + 25, groupsToIgnore],
      (row) => [row.slug, convertContract(row)] as [string, Contract]
    ),
    pg.map(
      `select slug, id, importance_score from groups where slug = ANY(
              select unnest(group_slugs) as slug
              from contracts
              where id = $1
              )
              and id not in (select unnest($2::text[]))
              order by importance_score desc
          `,
      [contractId, groupsToIgnore],
      (row) => ({
        slug: row.slug as string,
        importanceScore: row.importance_score as number,
      })
    ),
  ])
  const orderByNonStonks = (c: Contract) =>
    c.outcomeType !== 'STONK' && !c.question.includes('stock') ? 1 : 0
  const marketsByTopicSlug = orderAndDedupeGroupContracts(
    topics,
    orderBy(groupContracts, (c) => orderByNonStonks(c[1]), 'desc'),
    limit
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
  cachedRelatedMarkets.set(contractId, {
    marketIdsFromEmbeddings: marketsFromEmbeddings.map((c) => c.id),
    marketIdsByTopicSlug: Object.fromEntries(
      Object.entries(marketsByTopicSlug).map(([slug, contracts]) => [
        slug,
        contracts.map((c) => c.id),
      ])
    ),
    lastUpdated: Date.now(),
  })

  return {
    marketsFromEmbeddings: orderBy(
      marketsFromEmbeddings,
      orderByNonStonks,
      'desc'
    ).map(cleanContractForStaticProps),
    marketsByTopicSlug: mapValues(marketsByTopicSlug, (contracts) =>
      contracts.map(cleanContractForStaticProps)
    ),
  }
}

const cleanContractForStaticProps = (c: Contract) =>
  ({
    ...c,
    description: '',
    answers: [],
    groupSlugs: [],
    groupLinks: [],
  } as Contract)

const refreshedRelatedMarkets = async (
  contractId: string,
  cachedResults: cacheType,
  pg: SupabaseDirectClient
) => {
  log('returning cached related markets', { contractId })
  const refreshedContracts = await getContractsDirect(
    cachedResults.marketIdsFromEmbeddings.concat(
      Object.values(cachedResults.marketIdsByTopicSlug).flat()
    ),
    pg
  )
  return {
    marketsFromEmbeddings: refreshedContracts
      .filter((c) => cachedResults.marketIdsFromEmbeddings.includes(c.id))
      .map(cleanContractForStaticProps),
    marketsByTopicSlug: Object.fromEntries(
      Object.entries(cachedResults.marketIdsByTopicSlug).map(
        ([slug, contractIds]) => [
          slug,
          refreshedContracts
            .filter((c) => contractIds.includes(c.id))
            .map(cleanContractForStaticProps),
        ]
      )
    ),
  }
}
