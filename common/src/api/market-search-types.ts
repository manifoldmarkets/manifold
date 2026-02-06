import { z } from 'zod'
import { coerceBoolean } from './zod-types'

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
      ])
      .default('ALL'),
    offset: z.coerce.number().gte(0).default(0),
    limit: z.coerce.number().gt(0).lte(1000).default(100),
    // Cursor for efficient pagination: pass the createdTime of the last
    // result from the previous page. Only works with sort=newest.
    beforeTime: z.coerce.number().optional(),
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
  })
  .strict()
