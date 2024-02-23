import { GCPLog, getDoc, getUsers, revalidateStaticProps } from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { keyBy, uniq, uniqBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import {
  createBetFillNotification,
  createLimitBetCanceledNotification,
} from 'shared/create-notification'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { convertBet } from 'common/supabase/bets'
import { NormalizedBet } from 'common/new-bet'
import { maker } from 'api/place-bet'
import { redeemShares } from 'api/redeem-shares'

// Note: This is only partially transferred from the triggers/on-create-bet.ts
export const onCreateBets = async (
  normalBets: NormalizedBet[],
  contract: Contract,
  bettor: User,
  log: GCPLog,
  ordersToCancel: LimitBet[] | undefined,
  makers: maker[] | undefined
) => {
  const { mechanism } = contract
  if (mechanism === 'cpmm-1' || mechanism === 'cpmm-multi-1') {
    const userIds = uniq([
      bettor.id,
      ...(makers?.map((maker) => maker.bet.userId) ?? []),
    ])
    await Promise.all(
      userIds.map(async (userId) => redeemShares(userId, contract, log))
    )
    log('Share redemption transaction finished.')
  }

  if (ordersToCancel) {
    await Promise.all(
      ordersToCancel.map((order) => {
        createLimitBetCanceledNotification(
          bettor,
          order.userId,
          order,
          makers?.find((m) => m.bet.id === order.id)?.amount ?? 0,
          contract
        )
      })
    )
  }

  const betUsers = await getUsers(uniq(normalBets.map((bet) => bet.userId)))
  if (!betUsers.find((u) => u.id == bettor.id)) betUsers.push(bettor)

  const pg = createSupabaseDirectClient()
  const bets = normalBets.map((bet) => {
    const user = betUsers.find((user) => user.id === bet.userId)
    return {
      ...bet,
      userName: user?.name,
      userAvatarUrl: user?.avatarUrl,
      userUsername: user?.username,
    } as Bet
  })
  const userIdsToRefreshMetrics = uniq(
    bets.filter((b) => b.shares !== 0).map((bet) => bet.userId)
  )
  const usersToRefreshMetrics = betUsers.filter((user) =>
    userIdsToRefreshMetrics.includes(user.id)
  )
  await Promise.all(
    bets.map(async (bet) => {
      const idempotentId = bet.id + bet.contractId + '-limit-fill'
      const notifiedUsers = await notifyUsersOfLimitFills(
        bet,
        contract,
        idempotentId
      )
      usersToRefreshMetrics.push(...(notifiedUsers ?? []))
    })
  )
  if (usersToRefreshMetrics.length > 0) {
    await updateContractMetrics(
      contract,
      uniqBy(usersToRefreshMetrics, 'id'),
      bets,
      pg
    )
    log(`Contract metrics updated for ${usersToRefreshMetrics.length} users.`)
  }
}

const notifyUsersOfLimitFills = async (
  bet: Bet,
  contract: Contract,
  eventId: string
) => {
  if (!bet.fills || !bet.fills.length) return

  const matchingLimitBetIds = filterDefined(
    bet.fills.map((fill) => fill.matchedBetId)
  )
  if (!matchingLimitBetIds.length) return

  const matchingLimitBets = filterDefined(
    await Promise.all(
      matchingLimitBetIds.map(
        async (matchedBetId) =>
          getDoc<LimitBet>(`contracts/${contract.id}/bets`, matchedBetId)
        // pg.map(
        //   `select data from contract_bets where bet_id = $1`,
        //   [fill.matchedBetId],
        //   (r) => r.data as LimitBet
        // )
      )
    )
  ).flat()

  const matchingLimitBetUsers = await getUsers(
    matchingLimitBets.map((bet) => bet.userId)
  )

  const limitBetUsersById = keyBy(filterDefined(matchingLimitBetUsers), 'id')

  return filterDefined(
    await Promise.all(
      matchingLimitBets.map(async (matchedBet) => {
        const matchedUser = limitBetUsersById[matchedBet.userId]
        if (!matchedUser) return undefined

        await createBetFillNotification(
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
  recentBets: Bet[],
  pg: SupabaseDirectClient
) => {
  const metrics = await Promise.all(
    users.map(async (user) => {
      const bets = await pg.map(
        `select * from contract_bets where contract_id = $1 and user_id = $2`,
        [contract.id, user.id],
        convertBet
      )
      const recentBetsByUser = recentBets.filter(
        (bet) => bet.userId === user.id
      )
      // Handle possible replication delay
      bets.push(
        ...recentBetsByUser.filter((bet) => !bets.find((b) => b.id === bet.id))
      )
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
