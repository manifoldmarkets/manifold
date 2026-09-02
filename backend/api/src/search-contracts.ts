import {
  type FullMarketSearchResult,
  getMarketSearchRoute,
  searchProps,
} from 'common/api/market-search-types'
import { toLiteMarket } from 'common/api/market-types'
import { Contract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { orderBy, uniqBy } from 'lodash'
import { getGroupIdFromSlug } from 'shared/supabase/groups'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import {
  basicSearchSQL,
  getForYouSQL,
  getSearchContractSQL,
  getSemanticSearchContractSQL,
  SearchTypes,
  sortFields,
} from 'shared/supabase/search-contracts'
import {
  EMBEDDING_MODEL,
  generateEmbeddings,
} from 'shared/helpers/openai-utils'
import {
  BoundedSingleFlightCache,
  HierarchicalRollingWindowGate,
  isValidQueryEmbedding,
  normalizeSemanticSearchTerm,
  QUERY_EMBEDDING_DIMENSIONS,
  queryEmbeddingCacheKey,
  shouldAttemptSemanticFallback,
} from 'shared/helpers/semantic-search-fallback'
import { getIp } from 'shared/analytics'
import { cacheGetJson, cacheSetJson } from 'shared/redis/cache'
import { getPrivateUser, log } from 'shared/utils'
import { z } from 'zod'
import { APIError, type APIHandler } from './helpers/endpoint'

export const searchMarketsLite: APIHandler<'search-markets'> = async (
  props,
  auth
) => {
  const { includeLiteAnswers } = props
  // No semantic tail on the documented endpoint: LiteMarket carries no
  // searchMatchType marker, so similarity neighbours would be
  // indistinguishable from real matches to API consumers doing exact-title
  // existence checks, and to the MCP server, which shares this handler.
  const contracts = await search(props, auth?.uid, {
    allowSemanticFallback: false,
  })
  return contracts.map((c) => toLiteMarket(c, { includeLiteAnswers }))
}

export const searchMarketsFull: APIHandler<'search-markets-full'> = async (
  props,
  auth,
  req
) => {
  return await search(props, auth?.uid, {
    allowSemanticFallback: true,
    semanticCallerKey: getSemanticCallerKey(auth?.uid, req),
  })
}

export const getRecentMarkets: APIHandler<'recent-markets'> = async (
  props,
  auth
) => {
  return await search(props, auth.uid, { allowSemanticFallback: false })
}

const getSemanticCallerKey = (
  userId: string | undefined,
  req: Parameters<APIHandler<'search-markets-full'>>[2]
) => {
  if (userId) return `user:${userId}`
  return `ip:${getIp(req) ?? 'unknown'}`
}

// The caller key only matters when the fallback can run, so tie the two
// together rather than making every endpoint derive one.
type SearchOptions =
  | { allowSemanticFallback: false }
  | { allowSemanticFallback: true; semanticCallerKey: string }

const search = async (
  props: z.infer<typeof searchProps>,
  userId: string | undefined,
  options: SearchOptions
) => {
  const {
    term = '',
    filter,
    sort,
    offset,
    limit,
    topicSlug: possibleTopicSlug,
    forYou,
    token,
    gids,
  } = props
  const isPrizeMarket =
    props.isPrizeMarket == 'true' || props.isPrizeMarket == '1'

  if (limit === 0) {
    return []
  }

  if (offset > 1000) {
    throw new APIError(
      400,
      'offset must be <= 1000. Use sort=newest with the beforeTime parameter to page through contracts to see our entire market list.'
    )
  }

  const isForYou = forYou === '1'
  const isRecent = possibleTopicSlug === 'recent'
  const isFollowed = possibleTopicSlug === 'followed'
  const topicSlugForGroupIdLookup =
    possibleTopicSlug && !isRecent && !isFollowed
      ? possibleTopicSlug
      : undefined
  const pg = createSupabaseDirectClient()
  const groupId = topicSlugForGroupIdLookup
    ? await getGroupIdFromSlug(topicSlugForGroupIdLookup, pg)
    : undefined
  const groupIds =
    isFollowed && !!userId
      ? await pg.map(
          'select group_id from group_members where member_id = $1',
          [userId],
          (r) => r.group_id
        )
      : await getAllSubTopicsForParentTopicIds(pg, gids)
  if (isFollowed && userId && groupIds.length === 0) {
    return []
  }
  const searchRoute = getMarketSearchRoute({
    filter,
    term,
    topicSlug: topicSlugForGroupIdLookup,
    groupIds,
    sort,
    token,
    isRecent,
    isForYou,
    userId,
  })
  if (searchRoute === 'basic' || searchRoute === 'for-you') {
    // Enforce blocked users/contracts/topics in the query itself — the
    // client-side filter only patches holes in already-fetched pages.
    const privateUser = userId
      ? (await getPrivateUser(userId, pg)) ?? undefined
      : undefined
    if (searchRoute === 'basic' || !userId) {
      return await pg.map(
        basicSearchSQL({
          ...props,
          uid: userId,
          isPrizeMarket,
          privateUser,
        }),
        null,
        convertContract
      )
    } else {
      const forYouSql = await getForYouSQL({
        ...props,
        uid: userId,
        sort,
        isPrizeMarket,
        privateUser,
      })
      return await pg.map(forYouSql, [term], (r) => convertContract(r))
    }
  } else if (searchRoute === 'recent' && userId) {
    return await pg.map(
      'select data from get_your_recent_contracts($1, $2, $3)',
      [userId, limit, offset],
      convertContract
    )
  } else {
    const cleanTerm = term.replace(/[''"]/g, '')
    const searchTypes: SearchTypes[] = [
      'prefix',
      'without-stopwords',
      'answer',
      'with-stopwords',
      'description',
    ]

    const multiQuery = searchTypes
      .map((searchType) =>
        getSearchContractSQL({
          ...props,
          term: cleanTerm,
          uid: userId,
          searchType,
          groupId,
          isPrizeMarket,
          groupIds,
        })
      )
      .join(';')

    const results = await pg.multi(multiQuery).catch((e) => {
      // to_tsquery is sensitive to special characters and can throw an error
      log.error(`Error executing search query for term: ${term}`, e)
      return Array(searchTypes.length).fill([])
    })

    const [
      contractPrefixMatches,
      contractsWithoutStopwords,
      contractsWithMatchingAnswers,
      contractsWithStopwords,
      contractDescriptionMatches,
    ] = results.map(
      (result, i) =>
        result.map((r: any) => ({
          data: convertContract(r),
          searchType: searchTypes[i],
        })) as { data: Contract; searchType: SearchTypes }[]
    )

    const contractsOfSimilarRelevance = orderBy(
      [
        ...contractsWithoutStopwords,
        ...contractsWithMatchingAnswers,
        ...contractPrefixMatches,
      ],
      (c) =>
        sortFields[sort].sortCallback(c.data) *
        (c.searchType === 'answer' ? 0.5 : 1),
      sortFields[sort].order.includes('DESC') ? 'desc' : 'asc'
    )

    const lexicalResults = orderBy(
      uniqBy(
        [
          ...contractsWithStopwords, // most obviously relevant
          ...contractsOfSimilarRelevance, // next most relevant
          ...contractDescriptionMatches, // least obviously relevant
        ].map((c) => c.data),
        'id'
      ).slice(0, limit),
      (c) => sortFields[sort].sortCallback(c),
      sortFields[sort].order.includes('DESC') ? 'desc' : 'asc'
    )
    const markedLexicalResults: FullMarketSearchResult[] = lexicalResults.map(
      (contract) => ({
        ...contract,
        searchMatchType: 'lexical',
      })
    )
    if (!options.allowSemanticFallback) return markedLexicalResults

    const semanticResults: FullMarketSearchResult[] = (
      await semanticFallback({
        ...props,
        term: cleanTerm,
        uid: userId,
        groupId,
        groupIds,
        isPrizeMarket,
        lexicalResults,
        callerKey: options.semanticCallerKey,
        pg,
      })
    ).map((contract) => ({
      ...contract,
      searchMatchType: 'semantic',
    }))

    // Appended in similarity order rather than merged into the sort: these
    // matched no keyword, so ordering them by importance would float a weak
    // association above a strong one.
    return [...markedLexicalResults, ...semanticResults]
  }
}

// Below this many lexical hits, the page is effectively a dead end, so it is
// worth spending an embedding call to fill it.
const SEMANTIC_FALLBACK_MIN_RESULTS = 5
// Single characters and pairs are prefix-typing, not a failed search.
const SEMANTIC_FALLBACK_MIN_TERM_LENGTH = 3
// Longer than any real query; embedding pasted walls of text is pure cost.
const SEMANTIC_FALLBACK_MAX_TERM_LENGTH = 200
// Interactive search: past this, returning the lexical results we already
// have beats hanging the page on a slow OpenAI call. No retries for the same
// reason (the SDK default is 2 retries inside a ~10-minute timeout).
const SEMANTIC_FALLBACK_OPENAI_TIMEOUT_MS = 3000
const SEMANTIC_FALLBACK_MAX_INFLIGHT = 10
// A cache-miss budget also bounds sequential abuse: the in-flight cap alone
// still allows an unauthenticated caller to create an unbounded stream of
// unique OpenAI requests. Exhausting this budget only disables the optional
// fallback; lexical search continues normally.
const SEMANTIC_FALLBACK_MAX_EMBEDDINGS_PER_MINUTE = 60
const SEMANTIC_FALLBACK_MAX_EMBEDDINGS_PER_CALLER_PER_MINUTE = 10
const SEMANTIC_FALLBACK_MAX_CALLER_BUCKETS = 10_000
// Redis is deliberately disabled in the API deploy config, so keep a small
// process-local LRU as the dependable cache and use Redis as an optional
// cross-process layer. One embedding is roughly 30KB in JSON form; 100 entries
// keeps the per-process upper bound modest while retaining common searches.
const LOCAL_QUERY_EMBEDDING_CACHE_MAX_ENTRIES = 100
const QUERY_EMBEDDING_CACHE_TTL_S = 24 * 60 * 60
const queryEmbeddingCache = new BoundedSingleFlightCache<number[]>({
  maxEntries: LOCAL_QUERY_EMBEDDING_CACHE_MAX_ENTRIES,
  ttlMs: QUERY_EMBEDDING_CACHE_TTL_S * 1000,
  maxInflightCreates: SEMANTIC_FALLBACK_MAX_INFLIGHT,
})
const semanticEmbeddingGate = new HierarchicalRollingWindowGate(
  SEMANTIC_FALLBACK_MAX_EMBEDDINGS_PER_MINUTE,
  SEMANTIC_FALLBACK_MAX_EMBEDDINGS_PER_CALLER_PER_MINUTE,
  60_000,
  SEMANTIC_FALLBACK_MAX_CALLER_BUCKETS
)
// Cached terms bypass the embedding budget, so separately bound vector-query
// work that an unauthenticated caller could otherwise repeat indefinitely.
const SEMANTIC_FALLBACK_MAX_QUERIES_PER_MINUTE = 120
const SEMANTIC_FALLBACK_MAX_QUERIES_PER_CALLER_PER_MINUTE = 30
const SEMANTIC_FALLBACK_MAX_QUERY_INFLIGHT = 10
const semanticQueryGate = new HierarchicalRollingWindowGate(
  SEMANTIC_FALLBACK_MAX_QUERIES_PER_MINUTE,
  SEMANTIC_FALLBACK_MAX_QUERIES_PER_CALLER_PER_MINUTE,
  60_000,
  SEMANTIC_FALLBACK_MAX_CALLER_BUCKETS
)
let inflightSemanticQueries = 0

type SemanticSearchArgs = Parameters<typeof getSemanticSearchContractSQL>[0]

const semanticFallback = async (
  props: Omit<
    SemanticSearchArgs,
    'embedding' | 'privateUser' | 'excludeContractIds'
  > & {
    term: string
    lexicalResults: Contract[]
    callerKey: string
    pg: SupabaseDirectClient
  }
): Promise<Contract[]> => {
  const {
    term,
    uid,
    limit,
    offset,
    sort,
    beforeTime,
    lexicalResults,
    callerKey,
    pg,
  } = props
  const normalizedTerm = normalizeSemanticSearchTerm(term)
  if (
    !shouldAttemptSemanticFallback({
      term: normalizedTerm,
      offset,
      sort,
      beforeTime,
      lexicalResultCount: lexicalResults.length,
      limit,
      minResults: SEMANTIC_FALLBACK_MIN_RESULTS,
      minTermLength: SEMANTIC_FALLBACK_MIN_TERM_LENGTH,
      maxTermLength: SEMANTIC_FALLBACK_MAX_TERM_LENGTH,
    })
  ) {
    return []
  }

  // Fallback of a fallback: nothing in here — OpenAI, redis, the db — may
  // break the search itself. Any failure returns the lexical results alone.
  try {
    const cacheKey = queryEmbeddingCacheKey(normalizedTerm, EMBEDDING_MODEL)
    const localEmbedding = queryEmbeddingCache.get(cacheKey)
    const [cached, privateUser] = await Promise.all([
      localEmbedding === undefined
        ? cacheGetJson<unknown>(cacheKey)
        : localEmbedding,
      uid ? getPrivateUser(uid, pg).then((u) => u ?? undefined) : undefined,
    ])
    let embedding = isValidQueryEmbedding(cached) ? cached : undefined
    if (embedding !== undefined && localEmbedding === undefined) {
      queryEmbeddingCache.set(cacheKey, embedding)
    }
    if (embedding === undefined) {
      embedding = await queryEmbeddingCache.getOrCreate(
        cacheKey,
        async () => {
          // Widened on purpose: the SDK type promises number[], but the
          // dimension check is about what the API actually sent back, and the
          // predicate below would otherwise narrow a mismatch to never.
          const generated: unknown = await generateEmbeddings(normalizedTerm, {
            timeoutMs: SEMANTIC_FALLBACK_OPENAI_TIMEOUT_MS,
            maxRetries: 0,
          })
          // Request failures are logged inside generateEmbeddings.
          if (generated === undefined) return undefined
          if (!isValidQueryEmbedding(generated)) {
            // Paid for but unusable: a model or dimension change would
            // otherwise switch the feature off with nothing in the logs.
            log.error('Semantic search fallback got an unusable embedding', {
              model: EMBEDDING_MODEL,
              expectedDimensions: QUERY_EMBEDDING_DIMENSIONS,
              receivedType: Array.isArray(generated)
                ? 'array'
                : typeof generated,
              receivedDimensions: Array.isArray(generated)
                ? generated.length
                : undefined,
            })
            return undefined
          }
          // Optional cross-process cache; cacheSetJson is a no-op when Redis is
          // disabled and does not reject callers when Redis is unavailable.
          void cacheSetJson(cacheKey, generated, QUERY_EMBEDDING_CACHE_TTL_S)
          return generated
        },
        () => semanticEmbeddingGate.take(callerKey)
      )
      // No key configured, or OpenAI is down. A search with no results is a
      // worse page, not a broken one — leave it as it was.
      if (!embedding) return []
    }

    if (
      inflightSemanticQueries >= SEMANTIC_FALLBACK_MAX_QUERY_INFLIGHT ||
      !semanticQueryGate.take(callerKey)
    )
      return []
    inflightSemanticQueries++
    try {
      const results = await pg.map(
        getSemanticSearchContractSQL({
          ...props,
          embedding,
          privateUser,
          limit: limit - lexicalResults.length,
          excludeContractIds: lexicalResults.map((c) => c.id),
        }),
        null,
        convertContract
      )
      log('Semantic search fallback completed', {
        lexicalHits: lexicalResults.length,
        semanticHits: results.length,
      })
      return results
    } finally {
      inflightSemanticQueries--
    }
  } catch (e) {
    log.error('Semantic search fallback failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

const getAllSubTopicsForParentTopicIds = async (
  pg: SupabaseDirectClient,
  groupIds: string | undefined
) => {
  const initialTopIds = groupIds
    ? groupIds.split(',').filter((id) => id && id.length > 0)
    : []

  if (initialTopIds.length > 0) {
    const bottomGroupIds = await pg.map(
      `SELECT DISTINCT bottom_id FROM group_groups
                WHERE top_id in ($1:list) and bottom_id not in ($1:list)`,
      [initialTopIds],
      (r) => r.bottom_id
    )
    if (bottomGroupIds.length > 0) {
      return [...initialTopIds, ...bottomGroupIds]
    }
  }
  return initialTopIds
}
