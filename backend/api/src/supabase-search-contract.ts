import { z } from 'zod'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Json, MaybeAuthedEndpoint, validate } from './helpers'
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

export const supabasesearchcontracts = MaybeAuthedEndpoint(
  async (req, auth, log, logError) => {
    return await searchContracts(req.body, auth?.uid, log, logError)
  }
)

export const searchContracts = async (
  body: z.infer<typeof bodySchema>,
  userId: string | undefined,
  log: GCPLog,
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
  } = validate(bodySchema, body)

  if (limit === 0) {
    return [] as unknown as Json
  }

  const isForYou = possibleTopicSlug === 'for-you'
  const topicSlug =
    possibleTopicSlug && !isForYou ? possibleTopicSlug : undefined
  const pg = createSupabaseDirectClient()
  const groupId = topicSlug
    ? await getGroupIdFromSlug(topicSlug, pg)
    : undefined
  let contracts
  if (isForYou && !term && sort === 'score' && userId) {
    const forYouSql = getForYouSQL(userId, filter, contractType, limit, offset)
    contracts = await pg.map(forYouSql, [term], (r) => r.data as Contract)
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
        ...contractsOfSimilarRelevance,
        ...contractsWithStopwords,
        ...contractDescriptionMatches,
      ].map((c) => c.data),
      'id'
    ).slice(0, limit)
  }

  return (contracts ?? []) as unknown as Json
}

export const FIRESTORE_DOC_REF_ID_REGEX = /^[a-zA-Z0-9_-]{1,}$/

const bodySchema = z
  .object({
    term: z.string(),
    filter: z
      .union([
        z.literal('open'),
        z.literal('closing-this-month'),
        z.literal('closing-next-month'),
        z.literal('closed'),
        z.literal('resolved'),
        z.literal('all'),
      ])
      .default('all'),
    sort: z
      .union([
        z.literal('newest'),
        z.literal('score'),
        z.literal('daily-score'),
        z.literal('24-hour-vol'),
        z.literal('most-popular'),
        z.literal('liquidity'),
        z.literal('last-updated'),
        z.literal('close-date'),
        z.literal('resolve-date'),
        z.literal('random'),
        z.literal('bounty-amount'),
        z.literal('prob-descending'),
        z.literal('prob-ascending'),
      ])
      .default('most-popular'),
    contractType: z
      .union([
        z.literal('ALL'),
        z.literal('BINARY'),
        z.literal('MULTIPLE_CHOICE'),
        z.literal('FREE_RESPONSE'),
        z.literal('PSEUDO_NUMERIC'),
        z.literal('BOUNTIED_QUESTION'),
        z.literal('STONK'),
        z.literal('POLL'),
      ])
      .default('ALL'),
    offset: z.number().gte(0).default(0),
    limit: z.number().gt(0).lte(1000).default(100),
    topicSlug: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
    creatorId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
  })
  .strict()
