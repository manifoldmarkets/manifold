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
import { TierParamsType } from 'common/tier'

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
    contractType,
    offset,
    limit,
    topicSlug: possibleTopicSlug,
    forYou,
    creatorId,
    marketTier,
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
    !term &&
    (sort === 'score' || sort === 'freshness-score') &&
    !topicSlug &&
    token !== 'CASH' &&
    token !== 'CASH_AND_MANA' &&
    (!groupIds || groupIds.length === 0)
  ) {
    if (!isForYou || !userId) {
      return await pg.map(
        basicSearchSQL(
          userId,
          filter,
          contractType,
          limit,
          offset,
          sort,
          isPrizeMarket,
          marketTier as TierParamsType,
          token
        ),
        null,
        convertContract
      )
    } else {
      const forYouSql = await getForYouSQL({
        userId,
        filter,
        contractType,
        limit,
        offset,
        sort,
        isPrizeMarket,
        token,
        marketTier: marketTier as TierParamsType,
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
    const [
      contractPrefixMatches,
      contractsWithoutStopwords,
      contractsWithMatchingAnswers,
      contractsWithStopwords,
      contractDescriptionMatches,
    ] = await Promise.all(
      searchTypes.map(async (searchType) => {
        const searchSQL = getSearchContractSQL({
          term: cleanTerm,
          filter,
          sort,
          contractType,
          offset,
          limit,
          groupId,
          creatorId,
          uid: userId,
          isForYou,
          searchType,
          isPrizeMarket,
          token,
          groupIds,
          marketTier: marketTier as TierParamsType,
        })

        return pg
          .map(searchSQL, null, (r) => ({
            data: convertContract(r),
            searchType,
          }))
          .catch((e) => {
            // to_tsquery is sensitive to special characters and can throw an error
            log.error(`Error with type: ${searchType} for term: ${term}`, e)
            return []
          })
      })
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
