import { z } from 'zod'
import { APIError, jsonEndpoint, validate } from 'api/helpers'
import { getContractSupabase, getUserSupabase } from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { keyBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { createBetFillNotification } from 'shared/create-notification'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { MAX_ID_LENGTH } from 'common/group'

const BetRowSchema = z.object({
  amount: z.number().nullable(),
  answer_id: z.string().nullable(),
  bet_id: z.string().max(MAX_ID_LENGTH),
  contract_id: z.string().max(MAX_ID_LENGTH),
  created_time: z.string(),
  data: z.any(),
  fs_updated_time: z.string(),
  is_ante: z.boolean().nullable(),
  is_api: z.boolean().nullable(),
  is_challenge: z.boolean().nullable(),
  is_redemption: z.boolean().nullable(),
  outcome: z.string().nullable(),
  prob_after: z.number().nullable(),
  prob_before: z.number().nullable(),
  shares: z.number().nullable(),
  user_id: z.string(),
  visibility: z.string().nullable(),
})

const bodySchema = z
  .object({
    type: z.string(),
    table: z.string(),
    schema: z.string(),
    record: BetRowSchema,
    old_record: z.any().optional(),
  })
  .strict()

export const oncreatebet = jsonEndpoint(async (req, log) => {
  const { record: bet, type } = validate(bodySchema, req.body)
  if (type !== 'INSERT') {
    throw new APIError(400, 'This endpoint only handles inserts')
  }
  log('bet from insert trigger', bet)

  const pg = createSupabaseDirectClient()
  const betExists = await pg.oneOrNone(
    `select 1 from contract_bets where bet_id = $1 and contract_id = $2`,
    [bet.bet_id, bet.contract_id]
  )
  log('bet exists: ' + !!betExists)
  if (!betExists) throw new APIError(400, 'Bet already exists')

  const idempotentId = bet.bet_id + bet.contract_id + '-limit-fill'
  const previousEventExists = await pg.oneOrNone(
    `select 1 from user_notifications where notification_id = $1`,
    [idempotentId]
  )
  log('previousEventId exists: ' + !!previousEventExists)
  if (previousEventExists)
    throw new APIError(400, 'Notification already exists')

  const contract = await getContractSupabase(bet.contract_id)
  if (!contract) throw new APIError(404, 'Contract not found')
  const bettor = await getUserSupabase(bet.user_id)
  if (!bettor) throw new APIError(404, 'Bettor not found')
  if (previousEventExists) return { status: 'success', data: bet }
  const notifiedUsers = await notifyUsersOfLimitFills(
    bet.data as Bet,
    contract,
    idempotentId,
    bettor,
    pg
  )
  if (bet.shares !== 0) {
    await updateContractMetrics(
      contract,
      [bettor, ...(notifiedUsers ?? [])],
      pg
    )
  }
  return { status: 'success', data: bet }
})

const notifyUsersOfLimitFills = async (
  bet: Bet,
  contract: Contract,
  eventId: string,
  user: User,
  pg: SupabaseDirectClient
) => {
  if (!bet.fills) return

  const matchedFills = bet.fills.filter((fill) => fill.matchedBetId !== null)
  const matchedBets = (
    await Promise.all(
      matchedFills.map((fill) =>
        pg.map(
          `select data from contract_bets where bet_id = $1`,
          [fill.matchedBetId],
          (r) => r.data as LimitBet
        )
      )
    )
  ).flat()

  const betUsers = await Promise.all(
    matchedBets.map((bet) => getUserSupabase(bet.userId))
  )
  const betUsersById = keyBy(filterDefined(betUsers), 'id')

  return filterDefined(
    await Promise.all(
      matchedBets.map(async (matchedBet) => {
        const matchedUser = betUsersById[matchedBet.userId]
        if (!matchedUser) return undefined

        await createBetFillNotification(
          user,
          matchedUser,
          bet,
          matchedBet,
          contract,
          eventId
        )
        return matchedUser
      })
    )
  )
}

const updateContractMetrics = async (
  contract: Contract,
  users: User[],
  pg: SupabaseDirectClient
) => {
  const metrics = await Promise.all(
    users.map(async (user) => {
      const bets = await pg.map(
        `select data from contract_bets where contract_id = $1 and user_id = $2`,
        [contract.id, user.id],
        (r) => r.data as Bet
      )

      return calculateUserMetrics(contract, bets, user)
    })
  )

  await bulkUpdateContractMetrics(metrics.flat())
}
