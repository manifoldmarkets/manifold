import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'
import { orderBy } from 'lodash'
import {
  BetBalanceChange,
  PerpBalanceChange,
  TxnBalanceChange,
  BET_BALANCE_CHANGE_TYPES,
} from 'common/balance-change'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { formatMoney } from 'common/util/format'
import { Txn } from 'common/txn'
import { filterDefined } from 'common/util/array'
import { charities } from 'common/charity'
import { convertTxn } from 'common/supabase/txns'
import { LiquidityProvision } from 'common/liquidity-provision'
import { getContractsDirect } from 'shared/supabase/contracts'

// market creation fees
export const getBalanceChanges: APIHandler<'get-balance-changes'> = async (
  props
) => {
  const { userId, before, after, limit, offset, changeType } = props

  const isBetType =
    changeType !== undefined &&
    (BET_BALANCE_CHANGE_TYPES as readonly string[]).includes(changeType)
  const fetchBets = !changeType || isBetType
  const fetchTxns = !changeType || !isBetType
  const fetchLiquidity = !changeType || changeType === 'ADD_SUBSIDY'
  const fetchPerp = !changeType || changeType === 'perp_liquidation'

  const [betBalanceChanges, txnBalanceChanges, liquidityChanges, perpChanges] =
    await Promise.all([
      fetchBets ? getBetBalanceChanges(before, after, userId) : [],
      fetchTxns
        ? getTxnBalanceChanges(
            before,
            after,
            userId,
            !isBetType ? changeType : undefined
          )
        : [],
      fetchLiquidity ? getLiquidityBalanceChanges(before, after, userId) : [],
      fetchPerp ? getPerpBalanceChanges(before, after, userId) : [],
    ])

  let allChanges = orderBy(
    [
      ...betBalanceChanges,
      ...txnBalanceChanges,
      ...liquidityChanges,
      ...perpChanges,
    ],
    (change) => change.createdTime,
    'desc'
  )
  if (changeType) {
    allChanges = allChanges.filter((c) => c.type === changeType)
  }
  return allChanges.slice(offset, offset + limit)
}

// Balance-log subtitle for perp txns, synthesized from the typed txn data so
// the row reads like the bet rows ("Opened 5× long — Ṁ100 margin at 62,001").
const perpTxnDescription = (txn: Txn): string | undefined => {
  const d = txn.data as any
  if (!d) return undefined
  const px = (v: number) => formatPrice(v, inferPriceDecimals([v]))
  if (txn.category === 'PERP_OPEN_MARGIN') {
    const lev = Math.round(d.leverage) >= 2 ? `${Math.round(d.leverage)}× ` : ''
    return `Opened ${lev}${d.direction} — ${formatMoney(
      txn.amount
    )} margin at ${px(d.entryPrice)}`
  }
  if (txn.category === 'PERP_CLOSE_PAYOUT') {
    const verb =
      d.reason === 'flip'
        ? 'Flipped out of'
        : d.reason === 'resolve'
        ? 'Settled'
        : 'Closed'
    const pnl = Number(d.pnl ?? 0)
    return `${verb} ${d.direction} at ${px(d.closePrice)} — PnL ${
      pnl >= 0 ? '+' : ''
    }${formatMoney(pnl)}`
  }
  if (txn.category === 'PERP_RESOLVE_RESIDUAL') {
    return `Residual pools returned to creator (settled at ${px(
      d.finalPrice
    )})`
  }
  return undefined
}

// Ledger annotations for perp liquidations. No mana moves at liquidation
// (margin left the balance at open), so amount is 0 — the row makes the loss
// visible in the ledger on the day it became permanent.
const getPerpBalanceChanges = async (
  before: number | undefined,
  after: number,
  userId: string
) => {
  const pg = createSupabaseDirectClient()
  return await pg.map(
    `select e.id, e.ts, e.direction, e.size_delta, e.original_cost_basis_delta,
            e.oracle_price,
            c.question, c.slug, c.visibility, c.token,
            c.data->>'creatorUsername' as creator_username
     from contract_perp_events e
     join contracts c on c.id = e.contract_id
     where e.user_id = $3
       and e.event_type = 'liquidation'
       and ($1 is null or e.ts < millis_to_ts($1))
       and e.ts >= millis_to_ts($2)
     order by e.ts desc`,
    [before, after, userId],
    (r): PerpBalanceChange => {
      const margin = Math.abs(Number(r.original_cost_basis_delta))
      const size = Math.abs(Number(r.size_delta))
      const price = Number(r.oracle_price)
      const leverage = margin > 0 ? Math.round(size / margin) : 0
      const isPublic = r.visibility === 'public'
      return {
        key: `perp-liquidation-${r.id}`,
        type: 'perp_liquidation',
        amount: 0,
        createdTime: new Date(r.ts).getTime(),
        description: `${leverage >= 2 ? `${leverage}× ` : ''}${
          r.direction
        } liquidated at ${formatPrice(
          price,
          inferPriceDecimals([price])
        )} — ${formatMoney(margin)} margin forfeited to the pool`,
        contract: {
          question: isPublic ? r.question : '[unlisted question]',
          visibility: r.visibility,
          slug: isPublic ? r.slug : '',
          creatorUsername: r.creator_username,
          token: r.token,
        },
      }
    }
  )
}

const getTxnBalanceChanges = async (
  before: number | undefined,
  after: number,
  userId: string,
  categoryFilter?: string
) => {
  const pg = createSupabaseDirectClient()
  const balanceChanges = [] as TxnBalanceChange[]

  const txns = await pg.map(
    `select *
    from txns
    where
      ($1 is null or created_time < millis_to_ts($1)) and
      created_time >= millis_to_ts($2)
      and (to_id = $3 or from_id = $3)
      ${categoryFilter ? 'and category = $4' : ''}
    order by created_time`,
    categoryFilter
      ? [before, after, userId, categoryFilter]
      : [before, after, userId],
    convertTxn
  )
  const contractIds = filterDefined(
    txns.map((txn) => getContractIdFromTxn(txn))
  )
  const userIds = filterDefined(
    txns.map((txn) => getOtherUserIdFromTxn(txn, userId))
  )
  const contracts = await getContractsDirect(contractIds, pg)
  const users = await pg.map(
    `select id, username, name from users
    where id = any($1)`,
    [userIds],
    (row) => row
  )
  for (const txn of txns) {
    const contract = contracts.find((c) => c.id === getContractIdFromTxn(txn))
    const user = users.find((u) => u.id === getOtherUserIdFromTxn(txn, userId))
    const balanceChange: TxnBalanceChange = {
      key: txn.id,
      type: txn.category,
      token: txn.token,
      amount: txn.toId === userId ? txn.amount : -txn.amount,
      createdTime: txn.createdTime,
      description: txn.description ?? perpTxnDescription(txn),
      contract: contract
        ? {
            question:
              contract.visibility === 'public'
                ? contract.question
                : '[unlisted question]',
            visibility: contract.visibility,
            slug: contract.visibility === 'public' ? contract.slug : '',
            creatorUsername: contract.creatorUsername,
            token: contract.token,
          }
        : undefined,
      questType: txn.data?.questType,
      user: user ? { username: user.username, name: user.name } : undefined,
      charity:
        txn.toType === 'CHARITY'
          ? {
              name: charities.find((c) => c.id === txn.toId)?.name ?? txn.toId,
              slug: txn.toId,
            }
          : undefined,
    }
    balanceChanges.push(balanceChange)
  }
  return balanceChanges
}

const getLiquidityBalanceChanges = async (
  before: number | undefined,
  after: number,
  userId: string
) => {
  const pg = createSupabaseDirectClient()
  const liquidityDocs = await pg.map(
    `select data from contract_liquidity
    where user_id = $1
    and created_time >= millis_to_ts($2)
    and ($3 is null or created_time < millis_to_ts($3))
    and data->>'answerId' is not null
    order by created_time desc nulls last`,
    [userId, after, before],
    (row) => row.data as LiquidityProvision
  )

  const contractIds = filterDefined(liquidityDocs.map((doc) => doc.contractId))
  const contracts = await getContractsDirect(contractIds, pg)
  const liquidityChanges = [] as TxnBalanceChange[]
  for (const doc of liquidityDocs) {
    const contract = contracts.find((c) => c.id === doc.contractId)
    if (!contract) continue
    // We just used the ante txns in the balance log, no need to duplicate them
    if (Math.abs(doc.createdTime - contract.createdTime) < 100) continue
    const balanceChange: TxnBalanceChange = {
      key: doc.id,
      type: 'ADD_SUBSIDY',
      token: 'M$',
      amount: -doc.amount,
      createdTime: doc.createdTime,
      contract: {
        question:
          contract.visibility === 'public'
            ? contract.question
            : '[unlisted question]',
        visibility: contract.visibility,
        slug: contract.visibility === 'public' ? contract.slug : '',
        creatorUsername: contract.creatorUsername,
        token: contract.token,
      },
      answerText:
        doc.answerId &&
        contract.visibility === 'public' &&
        contract.mechanism === 'cpmm-multi-1'
          ? contract.answers.find((a) => a.id === doc.answerId)?.text
          : undefined,
    }
    liquidityChanges.push(balanceChange)
  }
  return liquidityChanges
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
  } else if ('data' in txn && txn.data?.contractId) {
    return txn.data.contractId
  }

  return null
}

const getBetBalanceChanges = async (
  before: number | undefined,
  after: number,
  userId: string
) => {
  const pg = createSupabaseDirectClient()
  const contractToBets: {
    [contractId: string]: {
      bets: (Bet & { answerText?: string | undefined })[]
      contract: BetBalanceChange['contract']
    }
  } = {}
  await pg.map(
    `select
       json_agg(cb.data || jsonb_build_object('answerText', a.text)) as bets,
       c.id,
       c.question,
       c.slug,
       c.visibility,
       c.data->>'creatorUsername' as creator_username,
       c.token
     from contract_bets cb
        join contracts c on cb.contract_id = c.id
        left join answers a on a.id = cb.answer_id
     where
        ($1 is null or cb.updated_time < millis_to_ts($1))
        and cb.updated_time >= millis_to_ts($2)
        and cb.user_id = $3
     group by c.id;
    `,
    [before, after, userId],
    (row) => {
      contractToBets[row.id] = {
        bets: orderBy(row.bets, (bet) => bet.createdTime, 'asc'),
        contract: {
          question: row.question,
          slug: row.slug,
          visibility: row.visibility,
          creatorUsername: row.creator_username,
          token: row.token,
        },
      }
    }
  )

  const balanceChanges = [] as BetBalanceChange[]
  for (const contractId of Object.keys(contractToBets)) {
    const { bets, contract } = contractToBets[contractId]

    for (let i = 0; i < bets.length; i++) {
      const bet = bets[i]
      const {
        isRedemption,
        isRebalance,
        outcome,
        createdTime,
        amount,
        shares,
      } = bet as any
      // Bets get their loan amount updated recently, we want to discard them
      if (bet.limitProb === undefined && bet.createdTime < after) continue

      const nextBetExists = i < bets.length - 1
      const nextBetIsRedemption = nextBetExists && bets[i + 1].isRedemption
      // Skip consecutive redemptions ONLY if they are not rebalance bets
      if (isRedemption && !isRebalance && nextBetIsRedemption) continue
      if (isRedemption && !isRebalance && amount === 0) continue

      const { question, visibility, creatorUsername, slug, token } = contract
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
          token,
        },
        answer:
          bet.answerText && bet.answerId
            ? { text: bet.answerText, id: bet.answerId }
            : undefined,
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
        // Rebalance bets have amount != 0 and represent the actual cash value.
        // Redemption bets had amount == 0 and use Math.abs(shares).
        const changeToBalance =
          isRedemption && !isRebalance ? Math.abs(shares) : -amount
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
