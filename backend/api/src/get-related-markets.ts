import { Contract } from 'common/contract'
import { isEligibleRelatedMarket } from 'common/related-markets'
import {
  capRelatedMarketsPerCreator,
  diversifyRelatedMarkets,
  RELATED_MARKETS_CANDIDATE_POOL,
  relatedMarketsMaxPerCreator,
} from 'common/related-markets-diversity'
import { MINUTE_MS } from 'common/util/time'
import { getContractsDirect } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { log, metrics } from 'shared/utils'
import { cacheGetJson, cacheSetJson } from 'shared/redis/cache'

import { APIHandler } from 'api/helpers/endpoint'
import { orderBy, uniqBy } from 'lodash'
import { TOPIC_SIMILARITY_THRESHOLD } from 'shared/helpers/embeddings'
import { aiModels, promptAI } from 'shared/helpers/prompt-ai'
import {
  isValidRelatedMarketsVerdict,
  relatedMarketsFilterKey,
} from 'shared/helpers/related-markets-filter'

type cacheType = {
  marketIdsFromEmbeddings: string[]
  lastUpdated: number
}
// L1: per-process, avoids a Redis round-trip on hot contracts. L2 (Redis) is
// shared across processes and survives redeploys; both store only the related
// contract ids — the contracts themselves are refetched fresh on every hit.
const cachedRelatedMarkets = new Map<string, cacheType>()
// Related membership changes when a market is published, unlisted, closed,
// resolved, or deleted. Keep the expensive embedding lookup cached briefly;
// every materialization still rechecks current contract eligibility.
const RELATED_MARKETS_CACHE_TTL_MS = 10 * MINUTE_MS
const RELATED_MARKETS_CACHE_TTL_S = RELATED_MARKETS_CACHE_TTL_MS / 1000
// The model's duplicate verdict is cached separately, keyed on the candidate
// set (see relatedMarketsFilterKey), so the 10-minute membership cache above
// can stay short without re-paying for the model on every re-render. ~11k
// calls/day, ~95% of all LLM calls in prod, before this cache.
const RELATED_MARKETS_FILTER_TTL_S = 24 * 60 * 60
const relatedMarketsCacheKey = (contractId: string, limit: number) =>
  // Version the key so deployment immediately abandons entries written by the
  // previous selection policy (v3: near-duplicate collapse + creator cap).
  `related-markets:v3:${contractId}:limit:${limit}`

// The HNSW index hands back at most hnsw.ef_search neighbours (40 on prod),
// whatever match_count asks for, and most of them are closed or resolved. On
// a page inside a 60-market templated series every one of those is the
// series, so the deeper candidate pool needs a wider search. Measured on prod
// 2026-11-17: ~15 ms for 150 candidates at 300, vs ~5 ms for the default.
const EXTENDED_POOL_EF_SEARCH = 300

type RelatedCandidate = Pick<
  Contract,
  | 'id'
  | 'question'
  | 'creatorId'
  | 'closeTime'
  | 'deleted'
  | 'isResolved'
  | 'mechanism'
  | 'visibility'
>

// Only the fields the selection needs: a full `data` row for 150 candidates
// can run past 1 MB. The chosen ids are materialized afterwards.
const CANDIDATES_SQL = `
  select contract_id as id,
    data->>'question' as question,
    data->>'creatorId' as creator_id,
    data->'closeTime' as close_time,
    data->'deleted' as deleted,
    data->'isResolved' as is_resolved,
    data->>'mechanism' as mechanism,
    data->>'visibility' as visibility
  from close_contract_embeddings(
    input_contract_id := $1,
    similarity_threshold := $2,
    match_count := $3
  )`

const toCandidate = (row: {
  id: string
  question: string | null
  creator_id: string | null
  close_time: unknown
  deleted: unknown
  is_resolved: unknown
  mechanism: string | null
  visibility: string | null
}): RelatedCandidate => ({
  id: row.id,
  question: row.question ?? '',
  creatorId: row.creator_id ?? '',
  closeTime:
    typeof row.close_time === 'number' && Number.isFinite(row.close_time)
      ? row.close_time
      : undefined,
  deleted: row.deleted === true,
  isResolved: row.is_resolved === true,
  mechanism: row.mechanism as Contract['mechanism'],
  visibility: row.visibility as Contract['visibility'],
})

/** Ranked candidates: first exactly the list this endpoint always fetched
 * (default search, `limit * 2`), then a deeper search that only supplies
 * replacements for candidates the near-duplicate collapse or the creator cap
 * set aside. A wider search alone would also reorder ordinary pages, since
 * similarity² × importance lets loosely related popular markets in. */
const fetchRelatedCandidates = (
  pg: SupabaseDirectClient,
  contractId: string,
  limit: number
) =>
  pg.tx(async (tx: SupabaseTransaction) => {
    const source = await tx.oneOrNone<{
      question: string | null
      creator_id: string | null
    }>(`select question, creator_id from contracts where id = $1`, [contractId])
    const core = await tx.map(
      CANDIDATES_SQL,
      [contractId, TOPIC_SIMILARITY_THRESHOLD, limit * 2],
      toCandidate
    )
    await tx.none(`set local hnsw.ef_search = $1`, [EXTENDED_POOL_EF_SEARCH])
    const extended = await tx.map(
      CANDIDATES_SQL,
      [
        contractId,
        TOPIC_SIMILARITY_THRESHOLD,
        Math.max(RELATED_MARKETS_CANDIDATE_POOL, limit * 4),
      ],
      toCandidate
    )
    return {
      source: {
        question: source?.question ?? '',
        creatorId: source?.creator_id ?? '',
      },
      candidates: uniqBy([...core, ...extended], (c) => c.id),
    }
  })

const orderByNonStonks = (c: Contract) =>
  c.outcomeType !== 'STONK' && !c.question.includes('stock') ? 1 : 0

// We cache the state of the contracts every 10 minutes via the cache header,
// and the actual contracts to include via the internal cachedRelatedMarkets.
export const getRelatedMarkets: APIHandler<'get-related-markets'> = async (
  body
) => {
  const { contractId, limit, question, uniqueBettorCount } = body
  const pg = createSupabaseDirectClient()
  const cacheKey = relatedMarketsCacheKey(contractId, limit)
  const cachedResults = cachedRelatedMarkets.get(cacheKey)
  if (
    cachedResults &&
    cachedResults.lastUpdated > Date.now() - RELATED_MARKETS_CACHE_TTL_MS
  ) {
    return materializeRelatedMarkets(contractId, cachedResults, pg, 'memory')
  }

  // L1 miss/stale: try the shared Redis cache before recomputing the (expensive)
  // embeddings search + Gemini filter.
  const cachedEntry = await cacheGetJson<cacheType>(cacheKey)
  if (
    cachedEntry != null &&
    Array.isArray(cachedEntry.marketIdsFromEmbeddings) &&
    Number.isFinite(cachedEntry.lastUpdated) &&
    cachedEntry.lastUpdated > Date.now() - RELATED_MARKETS_CACHE_TTL_MS
  ) {
    metrics.inc('cache/hits', { cache: 'related-markets' })
    cachedRelatedMarkets.set(cacheKey, cachedEntry)
    return materializeRelatedMarkets(contractId, cachedEntry, pg, 'redis')
  }
  metrics.inc('cache/misses', { cache: 'related-markets' })

  const { source, candidates } = await fetchRelatedCandidates(
    pg,
    contractId,
    limit
  )

  // Collapse near-duplicates and cap any one creator before the model sees
  // the list, so its input stays the same size as before (limit * 2).
  let marketsFromEmbeddings = diversifyRelatedMarkets(
    source,
    candidates.filter((contract) => isEligibleRelatedMarket(contract)),
    limit * 2,
    relatedMarketsMaxPerCreator(limit)
  )

  if (
    (uniqueBettorCount ?? 0) > 50 &&
    question &&
    marketsFromEmbeddings.length > 0
  ) {
    const filterKey = relatedMarketsFilterKey(
      contractId,
      question,
      marketsFromEmbeddings
    )
    let marketsToKeep: unknown = await cacheGetJson(filterKey)
    if (isValidRelatedMarketsVerdict(marketsToKeep, marketsFromEmbeddings)) {
      metrics.inc('cache/hits', { cache: 'related-markets-filter' })
    } else {
      metrics.inc('cache/misses', { cache: 'related-markets-filter' })
      log('Filtering related markets with AI', { contractId, question })
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

        marketsToKeep = await promptAI<string[]>(prompt, {
          model: aiModels.haiku,
          parseAsJson: true,
          thinkingLevel: 'minimal',
        })
        // An empty verdict is treated as "no filtering" below; don't pin
        // that for a day in case it was a bad answer rather than a judgment.
        if (
          isValidRelatedMarketsVerdict(marketsToKeep, marketsFromEmbeddings)
        ) {
          await cacheSetJson(
            filterKey,
            marketsToKeep,
            RELATED_MARKETS_FILTER_TTL_S
          )
        }
      } catch (error) {
        log.error('Error filtering related markets with AI, using unfiltered', {
          error,
        })
        marketsToKeep = undefined
      }
    }

    const keep = marketsToKeep
    if (isValidRelatedMarketsVerdict(keep, marketsFromEmbeddings)) {
      marketsFromEmbeddings = marketsFromEmbeddings.filter((market) =>
        keep.includes(market.id)
      )
    }
  }
  // Cap again rather than slice: once the model drops some markets, the
  // overflow behind them could otherwise put one creator back over the cap
  // while another creator's accepted markets fall off the end.
  marketsFromEmbeddings = capRelatedMarketsPerCreator(
    marketsFromEmbeddings,
    limit,
    relatedMarketsMaxPerCreator(limit)
  )

  const marketIds = marketsFromEmbeddings.map((c) => c.id)
  const cacheEntry = {
    marketIdsFromEmbeddings: marketIds,
    lastUpdated: Date.now(),
  }
  cachedRelatedMarkets.set(cacheKey, cacheEntry)
  await cacheSetJson(cacheKey, cacheEntry, RELATED_MARKETS_CACHE_TTL_S)

  return materializeRelatedMarkets(contractId, cacheEntry, pg, 'computed')
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

/** Refetch the chosen ids so every response carries current contract state,
 * and drop any that stopped being eligible. */
const materializeRelatedMarkets = async (
  contractId: string,
  cachedResults: cacheType,
  pg: SupabaseDirectClient,
  source: 'memory' | 'redis' | 'computed'
) => {
  log('returning related markets', { contractId, source })
  const refreshedContracts = await getContractsDirect(
    cachedResults.marketIdsFromEmbeddings,
    pg
  )
  const contractsById = new Map(refreshedContracts.map((c) => [c.id, c]))
  const orderedContracts = cachedResults.marketIdsFromEmbeddings
    .map((id) => contractsById.get(id))
    .filter((c): c is Contract => c != null && isEligibleRelatedMarket(c))

  return {
    marketsFromEmbeddings: orderBy(
      orderedContracts,
      orderByNonStonks,
      'desc'
    ).map(cleanContractForStaticProps),
  }
}
