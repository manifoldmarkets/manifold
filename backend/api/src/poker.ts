import { APIError, APIHandler } from './helpers/endpoint'
import {
  onlyUsersWhoCanPerformAction,
  rateLimitByUser,
} from './helpers/rate-limit'
import {
  actPoker,
  createPokerTable,
  getPokerTable,
  listPokerTables,
} from 'shared/poker/service'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'

// Poker database errors can contain a serialized deck. Expose/log only a generic
// API error here; the DB error hook also redacts poker transaction context.
async function safely<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof APIError) throw e
    throw new APIError(
      503,
      'Poker is temporarily unavailable. Retry with the same request ID.'
    )
  }
}
export const createPoker: APIHandler<'create-poker-table'> =
  onlyUsersWhoCanPerformAction(
    'bet',
    rateLimitByUser<'create-poker-table'>(
      async (p, auth) => safely(() => createPokerTable(auth.uid, p)),
      { maxCalls: 30 }
    )
  )
export const listPoker: APIHandler<'list-poker-tables'> = async (_p, auth) =>
  safely(() => listPokerTables(auth?.uid))
export const getPoker: APIHandler<'get-poker-table'> = async (p, auth) =>
  safely(() => getPokerTable(p.tableId, p.accessToken, auth?.uid))
const action: APIHandler<'act-poker'> = async (p, auth) =>
  safely(() => actPoker(auth.uid, p))
const checkedBet = onlyUsersWhoCanPerformAction('bet', action)
const checkedChat = onlyUsersWhoCanPerformAction('message', action)
export const pokerAction: APIHandler<'act-poker'> =
  rateLimitByUser<'act-poker'>(
    async (p, auth, req) => {
      if (p.action.type === 'chat') return checkedChat(p, auth, req)
      if (
        p.action.type === 'join' ||
        (p.action.type === 'ready' && p.action.ready)
      )
        return checkedBet(p, auth, req)
      return action(p, auth, req)
    },
    { maxCalls: 120, windowMs: 60_000 }
  )
export const setPokerEnabled: APIHandler<'set-poker-enabled'> = async (
  p,
  auth
) => {
  if (!isAdminId(auth.uid)) throw new APIError(403, 'Admin only')
  await createSupabaseDirectClient().none(
    'update poker_settings set new_hands_enabled=$1 where id=true',
    [p.enabled]
  )
  return { success: true }
}
