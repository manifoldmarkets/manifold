import type { APIHandler, AuthedUser } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { orderBy } from 'lodash'
import {
  AnyBalanceChangeType,
  BetBalanceChange,
  TXN_BALANCE_CHANGE_TYPES,
  TxnBalanceChange,
} from 'common/balance-change'
import { isAdminId } from 'common/envs/constants'
import { Txn } from 'common/txn'
import { filterDefined } from 'common/util/array'

// market creation fees
export const getBalanceChanges: APIHandler<'get-balance-changes'> = async (
  props,
  auth
) => {
  const { after, userId } = props
  const betBalanceChanges = await getBetBalanceChanges(after, userId, auth)
  const txnBalanceChanges = await getTxnBalanceChanges(after, userId)
  return orderBy(
    [...betBalanceChanges, ...txnBalanceChanges],
    (change) => change.createdTime,
    'desc'
  )
}
const getTxnBalanceChanges = async (after: number, userId: string) => {
  const pg = createSupabaseDirectClient()
  const balanceChanges = [] as AnyBalanceChangeType[]

  const txns = await pg.map(
    `
    select data
    from txns
    where fs_updated_time > millis_to_ts($1)
      and (data->>'toId' = $2 or data->>'fromId' = $2)
    and data->>'category' = ANY ($3);
    `,
    [after, userId, TXN_BALANCE_CHANGE_TYPES],
    (row) => row.data as Txn
  )
  const contractIds = filterDefined(
    txns.map((txn) => getContractIdFromTxn(txn))
  )
  const userIds = filterDefined(
    txns.map((txn) => getOtherUserIdFromTxn(txn, userId))
  )
  const contracts = await pg.map(
    `
    select data from contracts
    where id = any($1);
    `,
    [contractIds],
    (row) => row.data as Contract
  )
  const users = await pg.map(
    `
    select id, username, name from users
    where id = any($1);
    `,
    [userIds],
    (row) => row
  )
  for (const txn of txns) {
    const contract = contracts.find((c) => c.id === getContractIdFromTxn(txn))
    const user = users.find((u) => u.id === getOtherUserIdFromTxn(txn, userId))
    const balanceChange: TxnBalanceChange = {
      type: txn.category,
      amount: txn.toId === userId ? txn.amount : -txn.amount,
      createdTime: txn.createdTime,
      contract: contract
        ? {
            question: contract.question,
            visibility: contract.visibility,
            slug: contract.slug,
            creatorUsername: contract.creatorUsername,
          }
        : undefined,
      questType: txn.data?.questType,
      user: user ? { username: user.username, name: user.name } : undefined,
    }
    balanceChanges.push(balanceChange)
  }
  return balanceChanges
}

const getOtherUserIdFromTxn = (txn: Txn, userId: string) => {
  if (txn.toType === 'USER' && txn.toId !== userId) {
    return txn.toId
  } else if (txn.fromType === 'USER' && txn.fromId !== userId) {
    return txn.fromId
  }
  return undefined
}
const getContractIdFromTxn = (txn: Txn) => {
  if (txn.fromType === 'CONTRACT') {
    return txn.fromId
  } else if (txn.toType === 'CONTRACT') {
    return txn.toId
  } else if ('data' in txn && txn.data?.contractId) return txn.data.contractId
  if (
    ![
      'BETTING_STREAK_BONUS',
      'MARKET_BOOST_REDEEM',
      'QUEST_REWARD',
      'MANA_PAYMENT',
      'LOAN',
      'MARKET_BOOST_CREATE',
    ].includes(txn.category)
  )
    console.error('No contractId found for txn', txn)
  return null
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
      const { question, visibility, creatorUsername, slug } = contract
      const beHonest =
        isCurrentUser || visibility === 'public' || isAdminId(auth?.uid ?? '')
      const changeToBalance = !isRedemption ? -amount : -shares
      const text =
        contract.mechanism === 'cpmm-multi-1' && bet.answerId
          ? contract.answers.find((a) => a.id === bet.answerId)?.text
          : undefined
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
          question,
          // question: beHonest ? question : '[redacted]', // TODO: reenable this
          slug: beHonest ? slug : '[redacted]',
          visibility,
          creatorUsername,
        },
        createdTime,
        answer: text && bet.answerId ? { text, id: bet.answerId } : undefined,
      }
      balanceChanges.push(balanceChange)
    }
  }
  return balanceChanges
}
