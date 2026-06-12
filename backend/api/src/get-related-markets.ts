import { Contract } from 'common/contract'
import { HOUR_MS } from 'common/util/time'
import { getContractsDirect } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log, metrics } from 'shared/utils'
import { cacheGetJson, cacheSetJson } from 'shared/redis/cache'

import { APIHandler } from 'api/helpers/endpoint'
import { orderBy } from 'lodash'
import { TOPIC_SIMILARITY_THRESHOLD } from 'shared/helpers/embeddings'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'

type cacheType = {
  marketIdsFromEmbeddings: string[]
  lastUpdated: number
}
// L1: per-process, avoids a Redis round-trip on hot contracts. L2 (Redis) is
// shared across processes and survives redeploys; both store only the related
// contract ids — the contracts themselves are refetched fresh on every hit.
const cachedRelatedMarkets = new Map<string, cacheType>()
const RELATED_MARKETS_CACHE_TTL_S = 6 * 60 * 60
const relatedMarketsCacheKey = (contractId: string, limit: number) =>
  `related-markets:${contractId}:limit:${limit}`

const orderByNonStonks = (c: Contract) =>
  c.outcomeType !== 'STONK' && !c.question.includes('stock') ? 1 : 0

// We cache the state of the contracts every 10 minutes via the cache header,
// and the actual contracts to include for an hour via the internal cachedRelatedMarkets.
export const getRelatedMarkets: APIHandler<'get-related-markets'> = async (
  body
) => {
  const { contractId, limit, question, uniqueBettorCount } = body
  const pg = createSupabaseDirectClient()
  const cacheKey = relatedMarketsCacheKey(contractId, limit)
  const cachedResults = cachedRelatedMarkets.get(cacheKey)
  if (cachedResults && cachedResults.lastUpdated > Date.now() - HOUR_MS) {
    return refreshedRelatedMarkets(contractId, cachedResults, pg)
  }

  // L1 miss/stale: try the shared Redis cache before recomputing the (expensive)
  // embeddings search + Gemini filter.
  const cachedIds = await cacheGetJson<string[]>(cacheKey)
  if (cachedIds !== undefined) {
    metrics.inc('cache/hits', { cache: 'related-markets' })
    const entry: cacheType = {
      marketIdsFromEmbeddings: cachedIds,
      lastUpdated: Date.now(),
    }
    cachedRelatedMarkets.set(cacheKey, entry)
    return refreshedRelatedMarkets(contractId, entry, pg)
  }
  metrics.inc('cache/misses', { cache: 'related-markets' })

  const unfilteredMarketsFromEmbeddings = await pg.map(
    `
      select * from close_contract_embeddings(
        input_contract_id := $1,
        match_count := $2,
        similarity_threshold := $3
        )`,
    [contractId, limit * 2, TOPIC_SIMILARITY_THRESHOLD],
    (row) => row.data as Contract
  )

  let marketsFromEmbeddings = unfilteredMarketsFromEmbeddings

  if (
    (uniqueBettorCount ?? 0) > 50 &&
    question &&
    marketsFromEmbeddings.length > 0
  ) {
    log('Filtering related markets with Gemini', { contractId, question })
    try {
      const relatedMarketsData = marketsFromEmbeddings.map((market) => ({
        id: market.id,
        question: market.question,
      }))

      const prompt = `
I have a prediction market with the question: "${question}".
I also have a list of potentially related markets below.
Please identify which markets are semantically different enough to keep, and which are too similar in meaning and should be filtered out.

For markets that ask essentially the same question with different wording, like "Who will win the 2024 election?" vs "2024 election winner?", filter them out.
Only keep markets that are related but ask a meaningfully different question.

Related markets:
${JSON.stringify(relatedMarketsData)}

Return a JSON array containing ONLY the IDs of markets to KEEP (those that are different enough).
`

      const marketsToKeep = await promptAI<string[]>(prompt, {
        model: aiModels.flash,
        parseAsJson: true,
        thinkingLevel: 'minimal',
      })

      if (Array.isArray(marketsToKeep) && marketsToKeep.length > 0) {
        marketsFromEmbeddings = marketsFromEmbeddings.filter((market) =>
          marketsToKeep.includes(market.id)
        )
      }
    } catch (error) {
      log.error('Error filtering with Gemini, using unfiltered markets', {
        error,
      })
    }
  }
  marketsFromEmbeddings = marketsFromEmbeddings.slice(0, limit)

  const marketIds = marketsFromEmbeddings.map((c) => c.id)
  cachedRelatedMarkets.set(cacheKey, {
    marketIdsFromEmbeddings: marketIds,
    lastUpdated: Date.now(),
  })
  await cacheSetJson(cacheKey, marketIds, RELATED_MARKETS_CACHE_TTL_S)

  return {
    marketsFromEmbeddings: orderBy(
      marketsFromEmbeddings,
      orderByNonStonks,
      'desc'
    ).map(cleanContractForStaticProps),
  }
}

export const cleanContractForStaticProps = (c: Contract) =>
  ({
    ...c,
    description: '',
    answers:
      c.outcomeType === 'MULTI_NUMERIC' || c.outcomeType === 'DATE'
        ? c.answers
        : [],
    groupSlugs: [],
  } as Contract)

const refreshedRelatedMarkets = async (
  contractId: string,
  cachedResults: cacheType,
  pg: SupabaseDirectClient
) => {
  log('returning cached related markets', { contractId })
  const refreshedContracts = await getContractsDirect(
    cachedResults.marketIdsFromEmbeddings,
    pg
  )
  const contractsById = new Map(refreshedContracts.map((c) => [c.id, c]))
  const orderedContracts = cachedResults.marketIdsFromEmbeddings
    .map((id) => contractsById.get(id))
    .filter((c): c is Contract => c != null)

  return {
    marketsFromEmbeddings: orderBy(
      orderedContracts,
      orderByNonStonks,
      'desc'
    ).map(cleanContractForStaticProps),
  }
}
