import { z } from 'zod'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { MaybeAuthedEndpoint, typedEndpoint } from './helpers'
import {
  hasGroupAccess,
  getSearchContractSQL,
  getForYouSQL,
  SearchTypes,
  sortFields,
} from 'shared/supabase/search-contracts'
import { getGroupIdFromSlug } from 'shared/supabase/groups'
import { orderBy, uniqBy } from 'lodash'
import { convertContract } from 'common/supabase/contracts'
import { GCPLog } from 'shared/utils'
import { toLiteMarket } from 'common/api/market-types'
import { searchProps } from 'common/api/market-search-types'

export const searchMarketsLite = typedEndpoint(
  'search-markets',
  async (props, auth, { logError }) => {
    const contracts = await search(props, auth?.uid, logError)
    return contracts.map(toLiteMarket)
  }
)

export const searchMarketsFull = typedEndpoint(
  'search-markets-full',
  async (props, auth, { logError }) => {
    return await search(props, auth?.uid, logError)
  }
)

// TODO: delete after a few days
export const searchMarketsLegacy = MaybeAuthedEndpoint(
  async (req, auth, _log, logError) => {
    return await search(req.body, auth?.uid, logError)
  }
)

const search = async (
  props: z.infer<typeof searchProps>,
  userId: string | undefined,
  logError: GCPLog
) => {
  const {
    term,
    filter,
    sort,
    contractType,
    offset,
    limit,
    topicSlug: possibleTopicSlug,
    creatorId,
  } = props

  if (limit === 0) {
    return []
  }

  const isForYou = possibleTopicSlug === 'for-you'
  const isRecent = possibleTopicSlug === 'recent'
  const topicSlug =
    possibleTopicSlug && !isForYou && !isRecent ? possibleTopicSlug : undefined
  const pg = createSupabaseDirectClient()
  const groupId = topicSlug
    ? await getGroupIdFromSlug(topicSlug, pg)
    : undefined
  let contracts
  if (isForYou && !term && sort === 'score' && userId) {
    const forYouSql = getForYouSQL(userId, filter, contractType, limit, offset)
    contracts = await pg.map(forYouSql, [term], (r) => r.data as Contract)
  } else if (isRecent && !term && userId) {
    contracts = await pg.map(
      'select data from get_your_recent_contracts($1, $2, $3)',
      [userId, limit, offset],
      convertContract
    )
  } else {
    const groupAccess = await hasGroupAccess(groupId, userId)
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
          term,
          filter,
          sort,
          contractType,
          offset,
          limit,
          groupId,
          creatorId,
          uid: userId,
          isForYou,
          groupAccess,
          searchType,
        })
        return pg
          .map(searchSQL, [], (r) => ({
            data: convertContract(r),
            searchType,
          }))
          .catch((e) => {
            // to_tsquery is sensitive to special characters and can throw an error
            logError(`Error with type: ${searchType} for term: ${term}`)
            logError(e)
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

    contracts = uniqBy(
      [
        ...contractsWithStopwords,
        ...contractsOfSimilarRelevance,
        ...contractDescriptionMatches,
      ].map((c) => c.data),
      'id'
    ).slice(0, limit)
  }

  return contracts
}
