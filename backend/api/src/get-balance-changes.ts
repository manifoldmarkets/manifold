import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'
import { orderBy, uniq } from 'lodash'
import {
  BetBalanceChange,
  PerpBalanceChange,
  TxnBalanceChange,
  BET_BALANCE_CHANGE_TYPES,
} from 'common/balance-change'
import { inferPriceDecimals } from 'common/perps/format'
import { formatOraclePrice } from 'common/perps/oracle-display'
import { formatMoney, formatMoneyPrecise } from 'common/util/format'
import { Txn } from 'common/txn'
import { filterDefined } from 'common/util/array'
import { charities } from 'common/charity'
import { convertTxn } from 'common/supabase/txns'
import { toPublicTxn } from 'common/public-txn'
import { LiquidityProvision } from 'common/liquidity-provision'
import { isMultiCpmm, MultiContract } from 'common/contract'
import { getContractsDirect } from 'shared/supabase/contracts'

const MAX_ARRAY_LENGTH = 2 ** 32 - 1

// market creation fees
export const getBalanceChanges: APIHandler<'get-balance-changes'> = async (
  props
) => {
  const { userId, before, after, limit, offset } = props
  // An empty changeType has always meant no filter.
  const changeType = props.changeType || undefined

  const isBetType =
    changeType !== undefined &&
    (BET_BALANCE_CHANGE_TYPES as readonly string[]).includes(changeType)
  const fetchBets = !changeType || isBetType
  const fetchTxns = !changeType || !isBetType
  const fetchLiquidity = !changeType || changeType === 'ADD_SUBSIDY'
  const fetchPerp = !changeType || changeType === 'perp_liquidation'

  // The page is the newest `offset + limit` changes across all sources, so no
  // source needs more than its own newest `offset + limit`. Bounding the txn,
  // liquidity and perp reads keeps one request for a large account (the house
  // account has over a million txns) from loading its whole history.
  // No array is longer than MAX_ARRAY_LENGTH, so a larger offset is always an
  // empty page; checking first also keeps the SQL limit a valid bigint.
  if (!(offset < MAX_ARRAY_LENGTH)) return []
  const maxPerSource = Math.ceil(offset + limit)

  const [betBalanceChanges, txnBalanceChanges, liquidityChanges, perpChanges] =
    await Promise.all([
      fetchBets ? getBetBalanceChanges(before, after, userId) : [],
      fetchTxns
        ? getTxnBalanceChanges(
            before,
            after,
            userId,
            maxPerSource,
            !isBetType ? changeType : undefined
          )
        : [],
      fetchLiquidity
        ? getLiquidityBalanceChanges(before, after, userId, maxPerSource)
        : [],
      fetchPerp
        ? getPerpBalanceChanges(before, after, userId, maxPerSource)
        : [],
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
const perpTxnDescription = (
  txn: Txn,
  oracleFeedId?: string
): string | undefined => {
  const d = txn.data as any
  if (!d) return undefined
  const px = (v: number) =>
    formatOraclePrice(oracleFeedId, v, inferPriceDecimals([v]))
  if (txn.category === 'PERP_OPEN_MARGIN') {
    const lev = Math.round(d.leverage) >= 2 ? `${Math.round(d.leverage)}× ` : ''
    return `Opened ${lev}${d.direction} — ${formatMoney(
      txn.amount
    )} margin at ${px(d.entryPrice)}`
  }
  if (txn.category === 'PERP_CLOSE_PAYOUT') {
    const pnlNumber = Number(d.pnl ?? 0)
    const pnl = Number.isFinite(pnlNumber) ? pnlNumber : 0
    // Realised PnL and settlement payouts are fractional; formatMoney would
    // floor a +M$0.60 close to "+M$0" while the position history shows it.
    const pnlText = `${pnl >= 0 ? '+' : ''}${formatMoneyPrecise(pnl)}`
    if (d.reason === 'adl') {
      return `Auto-deleveraged ${d.direction} at ${px(
        d.closePrice
      )} — ${formatMoneyPrecise(txn.amount)} margin returned, profit ${pnlText}`
    }
    const verb =
      d.reason === 'flip'
        ? 'Flipped out of'
        : d.reason === 'resolve'
        ? 'Settled'
        : d.reason === 'partial-close'
        ? 'Partly closed'
        : 'Closed'
    return `${verb} ${d.direction} at ${px(d.closePrice)} — profit ${pnlText}`
  }
  if (txn.category === 'PERP_TAKER_FEE') {
    const bps = Number(d.feeBps)
    const pct = Number.isFinite(bps) ? ` (${(bps / 100).toFixed(2)}%)` : ''
    return `Opening fee${pct} on ${formatMoney(Number(d.sizeDelta) || 0)} ${
      d.direction
    } notional — paid into the market's backing pool`
  }
  if (txn.category === 'PERP_RESOLVE_RESIDUAL') {
    return `Residual pools returned to creator (settled at ${px(d.finalPrice)})`
  }
  return undefined
}

// Ledger annotations for perp liquidations. No mana moves at liquidation
// (margin left the balance at open), so amount is 0 — the row makes the loss
// visible in the ledger on the day it became permanent.
const getPerpBalanceChanges = async (
  before: number | undefined,
  after: number,
  userId: string,
  maxRows: number
) => {
  const pg = createSupabaseDirectClient()
  return await pg.map(
    `select e.id, e.ts, e.direction, e.size_delta, e.original_cost_basis_delta,
            e.oracle_price,
            c.question, c.slug, c.visibility, c.token,
            c.data->>'oracleFeedId' as oracle_feed_id,
            c.data->>'creatorUsername' as creator_username
     from contract_perp_events e
     join contracts c on c.id = e.contract_id
     where e.user_id = $3
       and e.event_type = 'liquidation'
       and ($1 is null or e.ts < millis_to_ts($1))
       and e.ts >= millis_to_ts($2)
     order by e.ts desc, e.id desc
     limit $4`,
    [before ?? null, after, userId, maxRows],
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
        } liquidated at ${formatOraclePrice(
          r.oracle_feed_id,
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
  maxRows: number,
  categoryFilter?: string
) => {
  const pg = createSupabaseDirectClient()
  const balanceChanges = [] as TxnBalanceChange[]

  // The user's newest maxRows txns, plus the rest of the oldest millisecond
  // among them, oldest first. The log sorts by millisecond and keeps a
  // millisecond's txns oldest first, so this holds every txn a page of
  // maxRows can show, in the order it shows them; `id` breaks exact ties.
  // Each side of the transfer reads its own index in time order
  // (txns_to_created_time, txns_from_created_time); the from side skips
  // self-transfers, so each txn appears once, as with `to_id or from_id`.
  const txns = await pg.map(
    `with newest as (
      select created_time from (
        (select created_time from txns
          where to_id = $3
            and created_time >= millis_to_ts($2)
            and ($1 is null or created_time < millis_to_ts($1))
            and ($4 is null or category = $4)
          order by created_time desc
          limit $5)
        union all
        (select created_time from txns
          where from_id = $3
            and to_id <> $3
            and created_time >= millis_to_ts($2)
            and ($1 is null or created_time < millis_to_ts($1))
            and ($4 is null or category = $4)
          order by created_time desc
          limit $5)
      ) both_sides
      order by created_time desc
      limit $5
    ),
    cutoff as (
      select case
        when count(*) < $5 then '-infinity'::timestamptz
        else date_trunc('milliseconds', min(created_time))
      end as since
      from newest
    )
    select * from txns
      where to_id = $3
        and created_time >= (select since from cutoff)
        and created_time >= millis_to_ts($2)
        and ($1 is null or created_time < millis_to_ts($1))
        and ($4 is null or category = $4)
    union all
    select * from txns
      where from_id = $3
        and to_id <> $3
        and created_time >= (select since from cutoff)
        and created_time >= millis_to_ts($2)
        and ($1 is null or created_time < millis_to_ts($1))
        and ($4 is null or category = $4)
    order by created_time, id`,
    [before ?? null, after, userId, categoryFilter || null, maxRows],
    (row) => toPublicTxn(convertTxn(row))
  )
  const contractIds = uniq(
    filterDefined(txns.map((txn) => getContractIdFromTxn(txn)))
  )
  const userIds = uniq(
    filterDefined(txns.map((txn) => getOtherUserIdFromTxn(txn, userId)))
  )
  const contracts = await getContractsDirect(contractIds, pg)
  const contractsById = new Map(contracts.map((c) => [c.id, c]))
  const users = await pg.map(
    `select id, username, name from users
    where id = any($1)`,
    [userIds],
    (row) => row
  )
  const usersById = new Map(users.map((u) => [u.id, u]))
  for (const txn of txns) {
    const contractId = getContractIdFromTxn(txn)
    const contract = contractId ? contractsById.get(contractId) : undefined
    const otherUserId = getOtherUserIdFromTxn(txn, userId)
    const user = otherUserId ? usersById.get(otherUserId) : undefined
    const balanceChange: TxnBalanceChange = {
      key: txn.id,
      type: txn.category,
      token: txn.token,
      amount: txn.toId === userId ? txn.amount : -txn.amount,
      createdTime: txn.createdTime,
      description:
        txn.description ??
        perpTxnDescription(
          txn,
          contract?.mechanism === 'perp' ? contract.oracleFeedId : undefined
        ),
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
  userId: string,
  maxRows: number
) => {
  const pg = createSupabaseDirectClient()
  // The newest maxRows rows the loop below will show. The join and the last
  // condition drop, in SQL, the rows the loop skips, so the limit counts only
  // rows that are shown:
  // - no market: the loop looks the market up by the string data.contractId;
  // - the ante, already shown by its txn: within 100 ms of the market's
  //   creation. As in JS, a JSON null market time counts as 0, and a missing
  //   one (NaN in JS, null here) never matches, hence `is not true`. Both
  //   tables' triggers cast createdTime to bigint, so the casts cannot fail.
  // Plain `desc` (nulls first) matches the contract_liquidity_user_id index,
  // so the scan stops at the limit; a null created_time already fails the
  // `>=` above. liquidity_id breaks ties, so every limit agrees.
  const liquidityDocs = await pg.map(
    `select cl.data from contract_liquidity cl
    join contracts c on c.id = cl.data->>'contractId'
    where cl.user_id = $1
    and cl.created_time >= millis_to_ts($2)
    and ($3 is null or cl.created_time < millis_to_ts($3))
    and cl.data->>'answerId' is not null
    and jsonb_typeof(cl.data->'contractId') = 'string'
    and (abs(
      (cl.data->>'createdTime')::numeric
      - case jsonb_typeof(c.data->'createdTime')
          when 'null' then 0
          else (c.data->>'createdTime')::numeric
        end
    ) < 100) is not true
    order by cl.created_time desc, cl.liquidity_id desc
    limit $4`,
    [userId, after, before ?? null, maxRows],
    (row) => row.data as LiquidityProvision
  )

  const contractIds = uniq(
    filterDefined(liquidityDocs.map((doc) => doc.contractId))
  )
  const contracts = await getContractsDirect(contractIds, pg)
  const contractsById = new Map(contracts.map((c) => [c.id, c]))
  // Answer text by id, built once per market (first match wins, as with find).
  const answerTextsByContract = new Map<string, Map<string, string>>()
  const getAnswerText = (contract: MultiContract, answerId: string) => {
    let texts = answerTextsByContract.get(contract.id)
    if (!texts) {
      texts = new Map()
      for (const a of contract.answers)
        if (!texts.has(a.id)) texts.set(a.id, a.text)
      answerTextsByContract.set(contract.id, texts)
    }
    return texts.get(answerId)
  }
  const liquidityChanges = [] as TxnBalanceChange[]
  for (const doc of liquidityDocs) {
    const contract = contractsById.get(doc.contractId)
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
        isMultiCpmm(contract)
          ? getAnswerText(contract, doc.answerId)
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
