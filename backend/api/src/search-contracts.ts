import { z } from 'zod'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'
import {
  getSearchContractSQL,
  getForYouSQL,
  sortFields,
  basicSearchSQL,
  SearchTypes,
} from 'shared/supabase/search-contracts'
import { getGroupIdFromSlug } from 'shared/supabase/groups'
import { orderBy, uniqBy } from 'lodash'
import { convertContract } from 'common/supabase/contracts'
import { log } from 'shared/utils'
import { toLiteMarket } from 'common/api/market-types'
import { searchProps } from 'common/api/market-search-types'

export const searchMarketsLite: APIHandler<'search-markets'> = async (
  props,
  auth
) => {
  const contracts = await search(props, auth?.uid)
  return contracts.map(toLiteMarket)
}

export const searchMarketsFull: APIHandler<'search-markets-full'> = async (
  props,
  auth
) => {
  return await search(props, auth?.uid)
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
    gids: groupIds,
  } = props
  const isPrizeMarket =
    props.isPrizeMarket == 'true' || props.isPrizeMarket == '1'

  if (limit === 0) {
    return []
  }

  const isForYou = forYou === '1'
  const isRecent = possibleTopicSlug === 'recent'
  const topicSlug =
    possibleTopicSlug && !isRecent ? possibleTopicSlug : undefined
  const pg = createSupabaseDirectClient()
  const groupId = topicSlug
    ? await getGroupIdFromSlug(topicSlug, pg)
    : undefined
  if (
    filter !== 'news' &&
    !term &&
    !topicSlug &&
    !groupIds &&
    (sort === 'score' || sort === 'freshness-score') &&
    (token === 'MANA' || token === 'ALL') &&
    !isRecent
  ) {
    if (!isForYou || !userId) {
      return await pg.map(
        basicSearchSQL({
          ...props,
          uid: userId,
          isPrizeMarket,
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
      })
      return await pg.map(forYouSql, [term], (r) => convertContract(r))
    }
  } else if (isRecent && !term && userId) {
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
    ] = results.map((result, i) =>
      result.map((r: any) => ({
        data: convertContract(r),
        searchType: searchTypes[i],
      }))
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

    return uniqBy(
      [
        ...contractsWithStopwords,
        ...contractsOfSimilarRelevance,
        ...contractDescriptionMatches,
      ].map((c) => c.data),
      'id'
    ).slice(0, limit)
  }
}
