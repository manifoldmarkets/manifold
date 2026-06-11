import { Contract } from 'common/contract'
import { HOUR_MS } from 'common/util/time'
import { getContractsDirect } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'

import { APIHandler } from 'api/helpers/endpoint'
import { orderBy } from 'lodash'
import { TOPIC_SIMILARITY_THRESHOLD } from 'shared/helpers/embeddings'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'

type cacheType = {
  marketIdsFromEmbeddings: string[]
  lastUpdated: number
}
const cachedRelatedMarkets = new Map<string, cacheType>()
// Only the related market *ids* are cached; their contract data is refetched
// fresh on every hit (see refreshedRelatedMarkets), so a long TTL only delays
// newly-created markets showing up as related — and close_contract_embeddings
// is one of the costlier recurring queries on the db.
const RELATED_MARKETS_TTL = 6 * HOUR_MS
// Entries are small (a contract id + ~10 related ids), but the map would
// otherwise grow without bound for the life of the process.
const MAX_CACHED_CONTRACTS = 20_000

// We cache the state of the contracts every 10 minutes via the cache header,
// and the actual contracts to include via the internal cachedRelatedMarkets.
export const getRelatedMarkets: APIHandler<'get-related-markets'> = async (
  body
) => {
  const { contractId, limit, question, uniqueBettorCount } = body
  const pg = createSupabaseDirectClient()
  const cachedResults = cachedRelatedMarkets.get(contractId)
  if (
    cachedResults &&
    cachedResults.lastUpdated > Date.now() - RELATED_MARKETS_TTL
  ) {
    return refreshedRelatedMarkets(contractId, cachedResults, pg)
  }
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

  const orderByNonStonks = (c: Contract) =>
    c.outcomeType !== 'STONK' && !c.question.includes('stock') ? 1 : 0

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

  if (
    !cachedRelatedMarkets.has(contractId) &&
    cachedRelatedMarkets.size >= MAX_CACHED_CONTRACTS
  ) {
    // Map iterates in insertion order, so this evicts the oldest entry.
    cachedRelatedMarkets.delete(cachedRelatedMarkets.keys().next().value!)
  }
  cachedRelatedMarkets.set(contractId, {
    marketIdsFromEmbeddings: marketsFromEmbeddings.map((c) => c.id),
    lastUpdated: Date.now(),
  })

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
  return {
    marketsFromEmbeddings: refreshedContracts.map(cleanContractForStaticProps),
  }
}
