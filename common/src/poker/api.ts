import { z } from 'zod'
import {
  PokerTableSummary,
  PokerTableView,
  POKER_MINIMUM_MULTIPLIER,
} from './types'

export const pokerAccess = {
  tableId: z.string().uuid(),
  // POST bodies only; the share link carries this in its fragment, never query.
  accessToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
}
export const pokerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join') }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('close') }).strict(),
  z.object({ type: z.literal('ready'), ready: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('move'),
      handId: z.string().uuid(),
      street: z.number().int().min(0).max(3),
      move: z.enum(['rock', 'paper', 'scissors']),
    })
    .strict(),
  z
    .object({
      type: z.literal('chat'),
      text: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('mute'),
      userId: z.string().min(1).max(128),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('ban'),
      userId: z.string().min(1).max(128),
      enabled: z.boolean(),
    })
    .strict(),
])
export const pokerAPI = {
  'create-poker-table': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        requestId: z.string().uuid(),
        ante: z
          .number()
          .int()
          .min(1)
          .max(Math.floor(Number.MAX_SAFE_INTEGER / POKER_MINIMUM_MULTIPLIER))
          .default(1),
        visibility: z.enum(['public', 'private']).default('public'),
        accessToken: pokerAccess.accessToken,
      })
      .strict()
      .refine(
        (p) => (p.visibility === 'private' ? !!p.accessToken : !p.accessToken),
        'Only private tables require an access token'
      ),
    returns: {} as { tableId: string },
  },
  'list-poker-tables': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    preferAuth: true,
    props: z.object({}).strict(),
    returns: {} as {
      tables: PokerTableSummary[]
      yourTableId?: string
      newHandsEnabled: boolean
    },
  },
  'get-poker-table': {
    cache: 'private, no-store',
    method: 'POST',
    visibility: 'undocumented',
    authed: false,
    preferAuth: true,
    props: z.object(pokerAccess).strict(),
    returns: {} as PokerTableView,
  },
  'act-poker': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        ...pokerAccess,
        requestId: z.string().uuid(),
        version: z.number().int().nonnegative(),
        action: pokerActionSchema,
      })
      .strict(),
    returns: {} as { success: boolean },
  },
  'set-poker-enabled': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({ enabled: z.boolean() }).strict(),
    returns: {} as { success: boolean },
  },
} as const
