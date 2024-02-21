import { GCPLog, getUser, getUsers, revalidateStaticProps } from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { keyBy, uniqBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import {
  createBetFillNotification,
  createFollowAfterReferralNotification,
} from 'shared/create-notification'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { manifoldLoveUserId } from 'common/love/constants'
import { MINUTE_MS } from 'common/util/time'
import { convertBet } from 'common/supabase/bets'

// Note: This is only partially transferred from the triggers/on-create-bet.ts
export const onCreateBet = async (
  bet: Bet,
  contract: Contract,
  bettor: User,
  log: GCPLog
) => {
  const idempotentId = bet.id + bet.contractId + '-limit-fill'

  const pg = createSupabaseDirectClient()

  if (
    bettor.createdTime > Date.now() - 10 * MINUTE_MS &&
    bettor.referredByUserId !== manifoldLoveUserId &&
    bettor.referredByUserId === contract.creatorId
  ) {
    const referredByUser = await getUser(bettor.referredByUserId)
    if (!referredByUser) {
      log(
        `User ${bettor.referredByUserId} not found, not creating follow after referral notification`
      )
    } else {
      const previousFollowExists = await pg.oneOrNone(
        `select 1 from user_follows where user_id = $1 and follow_id = $2`,
        [bettor.id, bettor.referredByUserId]
      )
      if (!previousFollowExists) {
        await pg.none(
          `insert into user_follows (user_id, follow_id) values ($1, $2)`,
          [bettor.id, bettor.referredByUserId]
        )
        await createFollowAfterReferralNotification(
          bettor.id,
          referredByUser,
          pg
        )
      }
    }
  }

  const notifiedUsers = await notifyUsersOfLimitFills(
    bet,
    contract,
    idempotentId,
    bettor,
    pg
  )
  if (bet.shares !== 0) {
    await updateContractMetrics(
      contract,
      [bettor, ...(notifiedUsers ?? [])],
      bet,
      pg
    )
  }
}

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

  const betUsers = await getUsers(matchedBets.map((bet) => bet.userId))

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
  bet: Bet,
  pg: SupabaseDirectClient
) => {
  const metrics = await Promise.all(
    users.map(async (user) => {
      const bets = await pg.map(
        `select * from contract_bets where contract_id = $1 and user_id = $2`,
        [contract.id, user.id],
        convertBet
      )
      // Handle possible replication delay
      if (user.id === bet.userId && !bets.find((b) => b.id === bet.id))
        bets.push(bet)
      return calculateUserMetrics(contract, bets, user)
    })
  )

  await bulkUpdateContractMetrics(metrics.flat())
  await Promise.all(
    uniqBy(metrics.flat(), 'userUsername').map((metric) =>
      revalidateStaticProps(`/${metric.userUsername}/portfolio`)
    )
  )
}
