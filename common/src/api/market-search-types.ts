import { z } from 'zod'
import type { Contract } from '../contract'
import { coerceBoolean } from './zod-types'

export type FullMarketSearchResult = Contract & {
  // Present on text-search results from marker-aware API workers. Keeping this
  // on the internal full-search shape lets mixed result UIs preserve
  // lexical/post ranking without promoting the semantic tail. It remains
  // optional so old workers and non-text search routes stay compatible.
  searchMatchType?: 'lexical' | 'semantic'
}

export const FIRESTORE_DOC_REF_ID_REGEX = /^[a-zA-Z0-9_-]{1,}$/

export const searchProps = z
  .object({
    term: z.string().optional(),
    filter: z
      .union([
        z.literal('open'),
        z.literal('closing-90-days'),
        z.literal('closing-week'),
        z.literal('closing-month'),
        z.literal('closing-day'),
        z.literal('closed'),
        z.literal('resolved'),
        z.literal('all'),
        z.literal('news'),
        z.literal('uncertain'),
      ])
      .default('all'),
    sort: z
      .union([
        z.literal('newest'),
        z.literal('score'),
        z.literal('daily-score'),
        z.literal('freshness-score'),
        z.literal('24-hour-vol'),
        z.literal('most-popular'),
        z.literal('liquidity'),
        z.literal('subsidy'),
        z.literal('last-updated'),
        z.literal('close-date'),
        z.literal('start-time'),
        z.literal('resolve-date'),
        z.literal('random'),
        z.literal('bounty-amount'),
        z.literal('prob-descending'),
        z.literal('prob-ascending'),
        z.literal('prob-50'),
      ])
      .default('score'),
    contractType: z
      .union([
        z.literal('ALL'),
        z.literal('BINARY'),
        z.literal('MULTIPLE_CHOICE'),
        z.literal('DEPENDENT_MULTIPLE_CHOICE'),
        z.literal('INDEPENDENT_MULTIPLE_CHOICE'),
        z.literal('FREE_RESPONSE'),
        z.literal('PSEUDO_NUMERIC'),
        z.literal('BOUNTIED_QUESTION'),
        z.literal('STONK'),
        z.literal('POLL'),
        z.literal('NUMBER'),
        z.literal('MULTI_NUMERIC'),
        z.literal('DATE'),
        z.literal('PERP'),
      ])
      .default('ALL'),
    offset: z.coerce.number().gte(0).default(0),
    limit: z.coerce.number().gt(0).lte(1000).default(100),
    // Cursor for efficient pagination: pass the createdTime of the last
    // result from the previous page. Only works with sort=newest.
    beforeTime: z.coerce.number().optional(),
    // Anchor for a stable seen-market filter across an offset-paginated browse
    // session. Clients must reuse the first page's value for load-more calls.
    seenMarketCutoffTime: z.coerce
      .number()
      .int()
      .gte(0)
      .lte(4_102_444_800_000)
      .optional(),
    topicSlug: z
      .string()
      .regex(FIRESTORE_DOC_REF_ID_REGEX)
      .or(z.literal('recent'))
      .or(z.literal('followed'))
      .optional(),
    forYou: z.union([z.literal('1'), z.literal('0')]).default('0'),
    creatorId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
    isPrizeMarket: z
      .union([
        z.literal('true'),
        z.literal('false'),
        z.literal('1'),
        z.literal('0'),
      ])
      .default('0'),
    token: z
      .union([
        z.literal('MANA'),
        z.literal('CASH'),
        z.literal('ALL'),
        z.literal('CASH_AND_MANA'),
      ])
      .default('MANA'),
    gids: z.string().optional(),
    liquidity: z.coerce.number().optional(),
    hasBets: z.union([z.literal('1'), z.literal('0')]).optional(),
    includeLiteAnswers: coerceBoolean.optional(),
    // Capability flag for the internal full-search UI. Keeping semantic
    // fallback opt-in prevents a new API worker from returning a semantic
    // tail to an old web bundle that does not understand its ordering marker.
    enableSemanticSearch: coerceBoolean.optional(),
    // Internal experiment arm. Authenticated requests are independently
    // assigned by the API; anonymous requests necessarily rely on the
    // persistent device assignment supplied by the web client.
    discoveryVariant: z.enum(['control', 'treatment']).optional(),
  })
  .strict()

type SearchProps = z.infer<typeof searchProps>

export type MarketSearchRoute = 'basic' | 'for-you' | 'recent' | 'filtered'

export const getMarketSearchRoute = ({
  filter,
  term,
  topicSlug,
  groupIds,
  sort,
  token,
  isRecent,
  isForYou,
  userId,
}: Pick<SearchProps, 'filter' | 'sort' | 'token'> & {
  term: string
  topicSlug?: string
  groupIds: readonly string[]
  isRecent: boolean
  isForYou: boolean
  userId?: string
}): MarketSearchRoute => {
  const isDefaultSearch =
    filter !== 'news' &&
    !term &&
    !topicSlug &&
    groupIds.length === 0 &&
    (sort === 'score' || sort === 'freshness-score') &&
    (token === 'MANA' || token === 'ALL') &&
    !isRecent

  if (isDefaultSearch) {
    return isForYou && userId ? 'for-you' : 'basic'
  }
  if (isRecent && !term && userId) {
    return 'recent'
  }
  return 'filtered'
}
