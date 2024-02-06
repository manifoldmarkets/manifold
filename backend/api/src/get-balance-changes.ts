import type { APIHandler, AuthedUser } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { orderBy } from 'lodash'
import { BetBalanceChange } from 'common/balance-change'
import { isAdminId } from 'common/envs/constants'

export const getBalanceChanges: APIHandler<'get-balance-changes'> = async (
  props,
  auth
) => {
  const { after, userId } = props
  const betBalanceChanges = await getBetBalanceChanges(after, userId, auth)
  return betBalanceChanges
}

const getBetBalanceChanges = async (
  after: number,
  userId: string,
  auth: AuthedUser | undefined
) => {
  const isCurrentUser = userId === auth?.uid

  const pg = createSupabaseDirectClient()
  const contractToBets: {
    [contractId: string]: {
      bets: Bet[]
      contract: Contract
    }
  } = {}
  await pg.map(
    `
     select json_agg(cb.data) as bets, c.data as contract
     from contract_bets cb
              join contracts c on cb.contract_id = c.id
     where cb.created_time > millis_to_ts($1)
        and cb.user_id = $2
     group by c.id;
    `,
    [after, userId],
    (row) => {
      contractToBets[row.contract.id] = {
        bets: orderBy(row.bets as Bet[], (bet) => bet.createdTime, 'asc'),
        contract: row.contract as Contract,
      }
    }
  )

  const balanceChanges = []
  for (const contractId of Object.keys(contractToBets)) {
    const { bets, contract } = contractToBets[contractId]
    const betsThusFar = []
    for (const bet of bets) {
      betsThusFar.push(bet)
      const nextBetExists = betsThusFar.length < bets.length
      const nextBetIsRedemption =
        nextBetExists && bets[betsThusFar.length].isRedemption
      const { isRedemption, createdTime, amount, shares } = bet

      if (isRedemption && nextBetIsRedemption) continue

      let { outcome } = bet
      if (isRedemption && betsThusFar[betsThusFar.length - 2]?.isRedemption) {
        // make outcome = the max of shares of either redemption bet
        const previousRedemptionBet = betsThusFar[betsThusFar.length - 2]
        outcome =
          Math.abs(previousRedemptionBet.amount) > Math.abs(amount)
            ? previousRedemptionBet.outcome
            : outcome
      }
      const { question, visibility, slug } = contract
      const beHonest =
        isCurrentUser || visibility === 'public' || isAdminId(auth?.uid ?? '')
      const changeToBalance = !isRedemption ? -amount : -shares
      const balanceChange: BetBalanceChange = {
        amount: changeToBalance,
        type: isRedemption
          ? 'redeem_shares'
          : amount < 0
          ? 'sell_shares'
          : 'create_bet',
        bet: {
          outcome,
          shares,
        },
        contract: {
          question: question,
          // question: beHonest ? question : '[redacted]', // TODO: reenable this
          slug: beHonest ? slug : '[redacted]',
          visibility: visibility,
        },
        createdTime: createdTime,
      }
      balanceChanges.push(balanceChange)
    }
  }
  return balanceChanges
}
