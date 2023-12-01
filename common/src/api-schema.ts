import { z } from 'zod'
import { MAX_ID_LENGTH } from './group'
import type { LiteMarket } from './api-market-types'
import type { JSONContent } from '@tiptap/core'
import type { Comment } from 'common/comment'
import type { User } from './user'
import { CandidateBet } from './new-bet'
import { LimitBet } from './bet'

// import { contentSchema } from 'shared/zod-types'

// ugh
const contentSchema: z.ZodType<JSONContent> = z.lazy(() =>
  z.intersection(
    z.record(z.any()),
    z.object({
      type: z.string().optional(),
      attrs: z.record(z.any()).optional(),
      content: z.array(contentSchema).optional(),
      marks: z
        .array(
          z.intersection(
            z.record(z.any()),
            z.object({
              type: z.string(),
              attrs: z.record(z.any()).optional(),
            })
          )
        )
        .optional(),
      text: z.string().optional(),
    })
  )
)

type APIGenericSchema = {
  // path to the endpoint
  path: string
  // GET is for retrieval, POST is to mutate something, PUT is idempotent mutation (can be repeated safely)
  method: 'GET' | 'POST' | 'PUT'
  //private APIs can only be called from manifold. undocumented endpoints can change or be deleted at any time!
  visibility: 'public' | 'undocumented' | 'private'
  // whether the endpoint requires authentication
  authed: boolean
  // zod schema for the request body (or for params for GET requests)
  props: z.ZodType
  // note this has to be JSON serializable
  returns?: Record<string, any>
}

let _type: any

export const API = {
  comment: {
    path: 'comment',
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: _type as Comment,
    props: z
      .object({
        contractId: z.string(),
        content: contentSchema.optional(),
        html: z.string().optional(),
        markdown: z.string().optional(),
        replyToCommentId: z.string().optional(),
        replyToAnswerId: z.string().optional(),
        replyToBetId: z.string().optional(),
      })
      .strict(),
  },

  bet: {
    path: 'bet',
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: _type as CandidateBet & { betId: string },
    props: z
      .object({
        contractId: z.string(),
        amount: z.number().gte(1),
        replyToCommentId: z.string().optional(),
        limitProb: z.number().gte(0).lte(1).optional(),
        expiresAt: z.number().optional(),
        // Used for binary and new multiple choice contracts (cpmm-multi-1).
        outcome: z.enum(['YES', 'NO']).default('YES'),
        //Multi
        answerId: z.string().optional(),
      })
      .strict(),
  },
  cancelBet: {
    path: 'cancel-bet',
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ betId: z.string() }).strict(),
    returns: _type as LimitBet,
  },

  markets: {
    path: 'markets',
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: _type as LiteMarket[],
    props: z
      .object({
        limit: z.coerce.number().gte(0).lte(1000).default(500),
        before: z.string().optional(),
        userId: z.string().optional(),
      })
      .strict(),
  },
  managram: {
    path: 'managram',
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        amount: z.number().finite(),
        toIds: z.array(z.string()),
        message: z.string(),
        groupId: z.string().max(MAX_ID_LENGTH).optional(),
      })
      .strict(),
  },
  me: {
    path: 'me',
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z.object({}),
    returns: _type as User,
  },
} as const

export type APIName = keyof typeof API

// making sure that API follows this type while still being const
const _typeCheck: { [k in APIName]: APIGenericSchema } = API

export type APISchema<N extends APIName> = (typeof API)[N]

export type APIParams<N extends APIName> = z.input<APISchema<N>['props']>
export type ValidatedAPIParams<N extends APIName> = z.output<
  APISchema<N>['props']
>

export type APIResponse<N extends APIName> = APISchema<N> extends {
  returns: Record<string, any>
}
  ? APISchema<N>['returns']
  : void
