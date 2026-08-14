import {
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
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { cacheGetJson, cacheSetJson } from 'shared/redis/cache'
import { getPrivateUser, log } from 'shared/utils'
import { z } from 'zod'
import { APIError, type APIHandler } from './helpers/endpoint'

export const searchMarketsLite: APIHandler<'search-markets'> = async (
  props,
  auth
) => {
  const { includeLiteAnswers } = props
  const contracts = await search(props, auth?.uid)
  return contracts.map((c) => toLiteMarket(c, { includeLiteAnswers }))
}

export const searchMarketsFull: APIHandler<'search-markets-full'> = async (
  props,
  auth
) => {
  return await search(props, auth?.uid)
}

export const getRecentMarkets: APIHandler<'recent-markets'> = async (
  props,
  auth
) => {
  return await search(props, auth.uid)
}

const search = async (
  props: z.infer<typeof searchProps>,
  userId: string | undefined
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

    const semanticResults = await semanticFallback({
      ...props,
      term: cleanTerm,
      uid: userId,
      groupId,
      groupIds,
      isPrizeMarket,
      lexicalResults,
      pg,
    })

    // Appended in similarity order rather than merged into the sort: these
    // matched no keyword, so ordering them by importance would float a weak
    // association above a strong one.
    return [...lexicalResults, ...semanticResults]
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
// Bounds concurrent OpenAI calls per server process during incidents or
// crawler storms (the read API runs a small pm2 cluster, so the fleet-wide
// cap is a small multiple of this). At the cap, fallback-eligible searches
// just return their lexical results.
const SEMANTIC_FALLBACK_MAX_INFLIGHT = 10
let inflightEmbeddingCalls = 0
// The embedding of a given string never changes; this only avoids re-paying
// the ~100ms OpenAI round-trip on repeated searches. ~30KB per entry, so keep
// the ttl short enough that one-off queries age out.
const QUERY_EMBEDDING_CACHE_TTL_S = 24 * 60 * 60
const queryEmbeddingCacheKey = (term: string) =>
  `search-embedding:${term.toLowerCase()}`

type SemanticSearchArgs = Parameters<typeof getSemanticSearchContractSQL>[0]

const semanticFallback = async (
  props: Omit<
    SemanticSearchArgs,
    'embedding' | 'privateUser' | 'excludeContractIds'
  > & {
    term: string
    lexicalResults: Contract[]
    pg: SupabaseDirectClient
  }
): Promise<Contract[]> => {
  const { term, uid, limit, offset, sort, beforeTime, lexicalResults, pg } =
    props
  if (
    offset > 0 ||
    // The sort=newest cursor contract reads createdTime off the LAST row of
    // each page (see beforeTime in market-search-types), and a similarity-
    // ordered tail poisons that on page 1 just as surely as on later pages —
    // so the newest sort gets no tail at all, and beforeTime is guarded
    // separately in case a client sends it with another sort.
    sort === 'newest' ||
    beforeTime !== undefined ||
    // URL terms take the exact slug-lookup branch in getSearchContractSQL;
    // embedding the URL text would append noise to an exact lookup.
    term.startsWith('https://') ||
    term.startsWith('http://') ||
    term.length < SEMANTIC_FALLBACK_MIN_TERM_LENGTH ||
    term.length > SEMANTIC_FALLBACK_MAX_TERM_LENGTH ||
    // Capped at limit: a full page under 5 hits (limit <= 4) is not a dead
    // end, and this also keeps the semantic query's limit strictly positive.
    lexicalResults.length >= Math.min(limit, SEMANTIC_FALLBACK_MIN_RESULTS)
  ) {
    return []
  }

  // Fallback of a fallback: nothing in here — OpenAI, redis, the db — may
  // break the search itself. Any failure returns the lexical results alone.
  try {
    const cacheKey = queryEmbeddingCacheKey(term)
    const [cached, privateUser] = await Promise.all([
      cacheGetJson<number[]>(cacheKey),
      uid ? getPrivateUser(uid, pg).then((u) => u ?? undefined) : undefined,
    ])
    let embedding = cached
    if (embedding === undefined) {
      if (inflightEmbeddingCalls >= SEMANTIC_FALLBACK_MAX_INFLIGHT) return []
      inflightEmbeddingCalls++
      try {
        embedding = await generateEmbeddings(term, {
          timeoutMs: SEMANTIC_FALLBACK_OPENAI_TIMEOUT_MS,
          maxRetries: 0,
        })
      } finally {
        inflightEmbeddingCalls--
      }
      // No key configured, or OpenAI is down. A search with no results is a
      // worse page, not a broken one — leave it as it was.
      if (!embedding) return []
      // Fire and forget: nothing reads the result and cacheSetJson never throws.
      void cacheSetJson(cacheKey, embedding, QUERY_EMBEDDING_CACHE_TTL_S)
    }

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
    log(`Semantic fallback for "${term}"`, {
      lexicalHits: lexicalResults.length,
      semanticHits: results.length,
    })
    return results
  } catch (e) {
    log.error(`Semantic search fallback failed for term: ${term}`, {
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
