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
) => {
  const { term, uid, limit, offset, lexicalResults, pg } = props
  if (
    offset > 0 ||
    term.length < SEMANTIC_FALLBACK_MIN_TERM_LENGTH ||
    lexicalResults.length >= SEMANTIC_FALLBACK_MIN_RESULTS
  ) {
    return []
  }

  const cacheKey = queryEmbeddingCacheKey(term)
  let embedding = await cacheGetJson<number[]>(cacheKey)
  if (embedding === undefined) {
    embedding = await generateEmbeddings(term)
    // No key configured, or OpenAI is down. A search with no results is a
    // worse page, not a broken one — leave it as it was.
    if (!embedding) return []
    await cacheSetJson(cacheKey, embedding, QUERY_EMBEDDING_CACHE_TTL_S)
  }

  const privateUser = uid ? (await getPrivateUser(uid, pg)) ?? undefined : undefined
  const results = await pg
    .map(
      getSemanticSearchContractSQL({
        ...props,
        embedding,
        privateUser,
        limit: limit - lexicalResults.length,
        excludeContractIds: lexicalResults.map((c) => c.id),
      }),
      [],
      convertContract
    )
    .catch((e) => {
      log.error(`Semantic search fallback failed for term: ${term}`, e)
      return [] as Contract[]
    })

  log(`Semantic fallback for "${term}"`, {
    lexicalHits: lexicalResults.length,
    semanticHits: results.length,
  })
  return results
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
