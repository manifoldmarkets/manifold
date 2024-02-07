import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { orderBy } from 'lodash'
import {
  BetBalanceChange,
  TXN_BALANCE_CHANGE_TYPES,
  TxnBalanceChange,
} from 'common/balance-change'
import { Txn } from 'common/txn'
import { filterDefined } from 'common/util/array'
import { STARTING_BALANCE } from 'common/economy'
import { getUser, log } from 'shared/utils'
import { User } from 'common/user'

// market creation fees
export const getBalanceChanges: APIHandler<'get-balance-changes'> = async (
  props
) => {
  const { after, userId } = props
  const user = await getUser(userId)
  if (!user) throw new APIError(404, 'User not found')
  const [betBalanceChanges, txnBalanceChanges] = await Promise.all([
    getBetBalanceChanges(after, userId),
    getTxnBalanceChanges(after, userId, user),
  ])
  return orderBy(
    [...betBalanceChanges, ...txnBalanceChanges],
    (change) => change.createdTime,
    'desc'
  )
}
const getTxnBalanceChanges = async (
  after: number,
  userId: string,
  user: User
) => {
  const pg = createSupabaseDirectClient()
  const balanceChanges = [] as TxnBalanceChange[]
  if (user.createdTime > after) {
    balanceChanges.push({
      type: 'STARTING_BALANCE',
      amount: STARTING_BALANCE,
      createdTime: user.createdTime,
    })
  }

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
            question:
              contract.visibility === 'public'
                ? contract.question
                : '[unlisted question]',
            visibility: contract.visibility,
            slug:
              contract.visibility === 'public' ? contract.slug : '[unlisted]',
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
      'SIGNUP_BONUS',
    ].includes(txn.category)
  )
    log('No contractId in get-balance-changes for txn', txn)
  return null
}

const getBetBalanceChanges = async (after: number, userId: string) => {
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

  const balanceChanges = [] as BetBalanceChange[]
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
          question: visibility === 'public' ? question : '[unlisted question]',
          slug: visibility === 'public' ? slug : '[unlisted]',
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
