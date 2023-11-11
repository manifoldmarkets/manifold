import { z } from 'zod'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Json, MaybeAuthedEndpoint, validate } from './helpers'
import {
  hasGroupAccess,
  getSearchContractSQL,
  getForYouSQL,
  SearchTypes,
} from 'shared/supabase/search-contracts'
import { getGroupIdFromSlug } from 'shared/supabase/groups'
import { uniqBy } from 'lodash'

export const supabasesearchcontracts = MaybeAuthedEndpoint(
  async (req, auth) => {
    return await searchContracts(req.body, auth?.uid)
  }
)

export const searchContracts = async (
  body: z.infer<typeof bodySchema>,
  userId?: string
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
      'with-stopwords',
      'description',
    ]
    const [
      contractPrefixMatches,
      contractsWithoutStopwords,
      contractsWithStopwords,
      contractDescriptionMatches,
    ] = await Promise.all(
      searchTypes.map(async (searchType) => {
        const searchTerm =
          searchType === 'prefix' ? constructPrefixTsQuery(term) : term
        const searchSQL = getSearchContractSQL({
          term: searchTerm,
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
          .map(searchSQL, [searchTerm], (r) => r.data as Contract)
          .catch((e) => {
            // to_tsquery is sensitive to special characters and can throw an error
            console.error(`Error with type: ${searchType} for term: ${term}`)
            console.error(e)
            return []
          })
      })
    )

    contracts = uniqBy(
      [
        ...contractPrefixMatches,
        ...contractsWithoutStopwords,
        ...contractsWithStopwords,
        ...contractDescriptionMatches,
      ],
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

const constructPrefixTsQuery = (term: string) => {
  const trimmed = term.trim()
  if (trimmed === '') return ''
  const sanitizedTrimmed = trimmed.replace(/'/g, "''").replace(/[!&|():*]/g, '')
  const tokens = sanitizedTrimmed.split(' ')
  tokens[tokens.length - 1] += ':*'
  return tokens.join(' & ')
}
