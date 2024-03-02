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
      key: 'starting-balance',
      type: 'STARTING_BALANCE',
      amount: STARTING_BALANCE,
      createdTime: user.createdTime,
    })
  }

  const txns = await pg.map(
    `
    select data
    from txns
    where created_time > millis_to_ts($1)
      and (to_id = $2 or from_id = $2)
    and category = ANY ($3);
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
      key: txn.id,
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
            slug: contract.visibility === 'public' ? contract.slug : '',
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
     where cb.fs_updated_time > millis_to_ts($1)
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

    for (let i = 0; i < bets.length; i++) {
      const bet = bets[i]
      const { isRedemption, outcome, createdTime, amount, shares } = bet
      // Bets get their loan amount updated recently, we want to discard them
      if (bet.limitProb === undefined && bet.createdTime < after) continue

      const nextBetExists = i < bets.length - 1
      const nextBetIsRedemption = nextBetExists && bets[i + 1].isRedemption
      if (isRedemption && nextBetIsRedemption) continue

      const { question, visibility, creatorUsername, slug } = contract
      const text =
        contract.mechanism === 'cpmm-multi-1' && bet.answerId
          ? contract.answers.find((a) => a.id === bet.answerId)?.text
          : undefined
      const balanceChangeProps = {
        key: bet.id,
        bet: {
          outcome,
          shares,
        },
        contract: {
          question: visibility === 'public' ? question : '[unlisted question]',
          slug: visibility === 'public' ? slug : '',
          visibility,
          creatorUsername,
        },
        answer: text && bet.answerId ? { text, id: bet.answerId } : undefined,
      }
      if (bet.limitProb !== undefined && bet.fills) {
        const fillsInTimeframe = bet.fills.filter(
          (fill) => fill.timestamp > after
        )
        for (const fill of fillsInTimeframe) {
          const balanceChange = {
            ...balanceChangeProps,
            key: `${bet.id}-${fill.timestamp}`,
            type: 'fill_bet',
            amount: -fill.amount,
            createdTime: fill.timestamp,
          } as BetBalanceChange
          balanceChanges.push(balanceChange)
        }
      } else {
        const changeToBalance = isRedemption ? -shares : -amount
        const balanceChange = {
          ...balanceChangeProps,
          type: isRedemption
            ? 'redeem_shares'
            : amount < 0
            ? 'sell_shares'
            : 'create_bet',
          amount: changeToBalance,
          createdTime,
        } as BetBalanceChange

        balanceChanges.push(balanceChange)
        if (!!bet.loanAmount && bet.loanAmount < 0) {
          balanceChanges.push({
            ...balanceChangeProps,
            key: `${bet.id}-loan-payment`,
            type: 'loan_payment',
            amount:
              bet.loanAmount +
              (isRedemption ? bets[i - 1]?.loanAmount ?? 0 : 0),
            createdTime: createdTime,
          } as BetBalanceChange)
        }
      }
    }
  }
  return balanceChanges
}
