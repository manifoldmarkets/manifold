import { groupBy, sumBy, uniq } from 'lodash'
import { runScript } from 'run-script'

import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { createManaPaymentNotification } from 'shared/create-notification'
import { broadcastUserUpdates, UserUpdate } from 'shared/supabase/users'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { getUser, isProd } from 'shared/utils'

// One-off (2026-11-19): make whole everyone who lost mana on the Anthropic
// (MNX) perp, https://manifold.markets/MNX/anthropic-mnx-valuation-futures-pri,
// while MNX's settlement rule was in doubt.
//
// On 2026-11-18 at 8:25pm PT, MNX changed the contract's settlement from basic
// to fully diluted shares. At 07:19:03 UTC on 11/19, Manifold announced on the
// market (comment 32spwwfnuh4) that everyone who lost mana "recently during
// any of the confusion" would be made whole and that the market resolves to
// MNX's version.
//
// Window: 2026-10-29 07:00 UTC (midnight PT) to that announcement. The start
// is the "last ~3 weeks" Manifold chose; the end is the announcement, after
// which the rules were clear, so trades and price moves after it don't count.
//
// Loss = minus each account's P&L on this market over the window:
//   payouts - margin - taker fees + position value at the end
//   - position value at the start,
// with positions valued by getPositionValue at the mnx-anthropic-mark oracle
// price (1888 at the start, 1751 at the end). This is the quantity
// calculatePerpMetricPeriods reports. Funding and partial ADL are in the
// position value. Liquidations pay zero. Order escrow is held at face value,
// so it nets out. The figures were computed in SQL against prod. The six
// largest were re-derived with common/perps/metric-periods.ts and agree to
// within M$0.005. Event-based deposits and payouts match the txn ledger
// exactly.
//
// Accounts left out: Gen (Manifold staff, who posted the announcement) and
// jimman (deleted account).
//
// Amount = the full-precision loss rounded up to whole mana, computed before
// the loss is rounded for display. UsmanKotwal's 101.00001 rounds up to 102.
//
// Paid from @Manifold (HOUSE_LIQUIDITY_PROVIDER_ID) as managrams (public
// MANA_PAYMENTs, same shape as api/managram.ts) with the message
// "Anthropic perp refund" and the usual notification. Safe to re-run: an account
// with exactly one payment in this group, at the expected amount, is
// skipped. Any other existing payment stops the script for reconciliation.
//
// Usage (from backend/scripts, with the prod Firebase env):
//   ts-node refund-mnx-anthropic-losses.ts           # dry run, prints the list
//   ts-node refund-mnx-anthropic-losses.ts --apply   # pays

const CONTRACT_ID = 'lnccuhNtuCC9'
const CONTRACT_SLUG = 'anthropic-mnx-valuation-futures-pri'
const GROUP_ID = 'mnx-anthropic-refund-2026-11-19'
const MESSAGE = 'Anthropic perp refund'

// [username, userId, loss in M$ (display), amount to pay in whole M$]
// prettier-ignore
const REFUNDS: [string, string, number, number][] = [
  ['bobalobascrob', 'KKIV9Wehe8T1xcnL51lbpDH5CGH3', 3254.3588, 3255],
  ['prismatic', 'vbWl1dKRklRmZQoN6uJBJEosFYx2', 3111.618, 3112],
  ['PenguinBot', 'K4k0ojdRyJak655cARqK3grGtoM2', 362.68, 363],
  ['JoeandSeth', '6Q1UZ4BfBoUNAtN8KTY35joPlXi1', 245.7934, 246],
  ['gigab0nus', 'e4uEmboKKXedpcoMa6ew4f1adTn2', 230.2946, 231],
  ['UsmanKotwal', 'jVsAsfmQ1jhGKCg7Mvlj5e79i1I2', 101.0, 102],
  ['smnsmnsmnsmns', 'BP5O0t3gpRTMqqeGeTdAefg6PRb2', 96.8431, 97],
  ['Thomas42', 'JeSQzLyoMcdweiCcVZFKB4kPqrm1', 78.1396, 79],
  ['JoJo2dOA', 'l9Qoysg9roWV8iQ6MKzyaz4iDkx1', 64.7837, 65],
  ['Fynn', 'cuKDpwNFRxQNOxP4pqiSF2DdscB2', 55.9398, 56],
  ['TonyM', '5xKJFYmiy5Q5MPImm84gApz4P153', 33.084, 34],
  ['LucasKlein', 'WLELDn2ludgYCl8ryO96KdRQWCx2', 29.943, 30],
  ['antony', 'FJoJl5KrhBMofHPGPpTmw5b99h02', 29.5717, 30],
  ['TEJASVA', 'cFfTxysWKeOn6IbZiUmTfWay7Jx2', 28.0824, 29],
  ['MonicaLewinsky', 'o527kTOFRRSAxyuW8OdWcNBmG5g2', 20.1932, 21],
  ['Simon74fe', '85nJB0gHwPMXmUtBO72YrwlNDI22', 17.4198, 18],
  ['kenakofer', 'Gyd3QdwSQOe0jMGxT2SnXisJv202', 15.3974, 16],
  ['benmanns', 'Fxsi2an7IoMsNLyq1ODqsXZIMqC3', 14.9041, 15],
  ['jgyou', 'Kr23YYpkdnU4JFFqHr2NxEV6PvN2', 13.3582, 14],
  ['CKLorentzen', 'REehXHk1JiNAaGSLHDusDBjBC1t1', 12.2887, 13],
  ['JonTdb03', '2QBuScWcsAYIvTZAoUccfHGpcdH3', 11.2177, 12],
  ['JackSchpeck', 'K99Y9Q7eQPd3txnTYosKbYtaszl1', 9.4727, 10],
  ['CM', 'qbNw0R5uJzWwkwiD2P2ZW9n0cmH3', 8.4881, 9],
  ['Pyroll', 'XZpEj3jchxZ1Ag4CwhngTPcbGey2', 8.0391, 9],
  ['Eva0lZcq', 'WEUlvEgzICYcahKCeLergEQv7lV2', 5.8881, 6],
  ['PaulSas', 'H0rIsjSduiRnFYwpGuJLvtiO2eH3', 5.6944, 6],
  ['BarryJones', 'g3T06FLUS2TsQapOc3jc9pp1wPN2', 5.0927, 6],
  ['Kosmos', 'ZMMrAQsvf5fEzkrHGcvO7UWcGCt2', 4.0056, 5],
  ['kingbun', '4X7QkFLsYDZpLBAbJ5rZ6THOtUK2', 3.1144, 4],
  ['leapingturtlefrog', '3Sux7tbNVsNa73dgpLYeDHT0DXE2', 2.6565, 3],
  ['WasaySyed', 'yCihlMpViwUwGGPPsI9PHZcyq4I3', 2.122, 3],
  ['jim', 'OdBj5DW6PbYtnImvybpyZzfhb133', 1.6084, 2],
  ['Elmir', 'Jm2KqmHZLtfeZUYfRnZvH9pDvhe2', 1.6032, 2],
  ['TJTripp', 'kvSfwr5napO7OtGMm9kGyEeUloZ2', 1.5656, 2],
  ['i17ns', 'E02KExkMGLXldojkfh1jKdMhyPr1', 1.1664, 2],
  ['loops', 'd3TsKbqjJNVaBJ0Ouw567WGDzn83', 0.8499, 1],
  ['DanielSelbrede', 'eDmb5y56dbOVhp7KiBHzPA1Q3Mg2', 0.8499, 1],
  ['AlieuFaye', 'UgARt5REMLZddi9RQFjYIbeiDie2', 0.8496, 1],
  ['0degrees', 'UBfxblO7XhS5ghydGKAnNzg4Ybq2', 0.8473, 1],
  ['JessicaEvans', 'G4JTSx4yXAYll9JkJOj0z0qNNBt1', 0.5382, 1],
  ['Bernard', 'iMTJTNeA5zbL0qM5kuvIr1f7jNr2', 0.5241, 1],
  ['GreatUmejesi', 'kMABWQm4JOb7xKIZUs19sdpOXgk2', 0.3581, 1],
  ['Mila0pIqR', '8uAs87g55teJfZ02iHyewEu2vTv2', 0.1604, 1],
  ['AsptheWyvern', '1PHuv7bjTTXrtjpY341Z2hGCyn22', 0.1492, 1],
  ['Qrsmith', 'vwOcV30aMGWTCpiyaGBT0k6Ir2L2', 0.1443, 1],
  ['JimD', 'PdaXOSxEUMTti0n2BwwjygZRbrn2', 0.1022, 1],
  ['KycoK_Ov4arku', 'RZTODXQiImVHLSZfCgsovxMdqpw2', 0.1018, 1],
]

// Guards against an accidental edit of the list above.
const EXPECTED_ACCOUNTS = 47
const EXPECTED_TOTAL = 7919

const refunds = REFUNDS.map(([username, userId, loss, amount]) => ({
  username,
  userId,
  loss,
  amount,
}))

type ExistingPayment = { to_id: string; amount: number; token: string }

// Returns true when the account already has exactly the expected payment,
// false when it has none, and throws on anything else.
const checkExisting = (
  r: (typeof refunds)[number],
  existing: ExistingPayment[]
) => {
  if (existing.length === 0) return false
  if (
    existing.length === 1 &&
    existing[0].token === 'M$' &&
    Number(existing[0].amount) === r.amount
  ) {
    return true
  }
  throw new Error(
    `@${r.username} already has ${existing.length} payment(s) in ${GROUP_ID} ` +
      `(${existing.map((e) => `${e.token}${e.amount}`).join(', ')}), ` +
      `expected one of M$${r.amount}. Reconcile by hand; nothing more paid.`
  )
}

runScript(async ({ pg }) => {
  const apply = process.argv.includes('--apply')

  if (
    refunds.some(
      (r) =>
        !Number.isFinite(r.loss) ||
        r.loss <= 0 ||
        !Number.isSafeInteger(r.amount) ||
        r.amount < r.loss ||
        // > 1 only by display rounding, e.g. UsmanKotwal (101.00001 -> 102)
        r.amount - r.loss > 1.001
    ) ||
    uniq(refunds.map((r) => r.userId)).length !== refunds.length ||
    refunds.length !== EXPECTED_ACCOUNTS ||
    sumBy(refunds, 'amount') !== EXPECTED_TOTAL
  ) {
    throw new Error('Refund list failed validation; nothing paid')
  }

  if (!isProd()) throw new Error('Run this against prod only')
  const contract = await pg.oneOrNone<{ slug: string }>(
    `select slug from contracts where id = $1`,
    [CONTRACT_ID]
  )
  if (contract?.slug !== CONTRACT_SLUG) {
    throw new Error(`Contract ${CONTRACT_ID} not found; is this prod?`)
  }

  const house = await getUser(HOUSE_LIQUIDITY_PROVIDER_ID)
  if (!house) throw new Error('House account not found')

  const users = await pg.manyOrNone<{ id: string; username: string }>(
    `select id, username from users where id = any($1)`,
    [refunds.map((r) => r.userId)]
  )
  const usernames = Object.fromEntries(users.map((u) => [u.id, u.username]))
  const missing = refunds.filter((r) => !usernames[r.userId])
  if (missing.length > 0) {
    throw new Error(
      `Unknown users: ${missing.map((r) => r.username).join(', ')}`
    )
  }

  const existingRows = await pg.manyOrNone<ExistingPayment>(
    `select to_id, amount, token from txns
      where category = 'MANA_PAYMENT'
        and from_id = $1
        and data->'data'->>'groupId' = $2`,
    [HOUSE_LIQUIDITY_PROVIDER_ID, GROUP_ID]
  )
  const existingByUser = groupBy(existingRows, (e) => e.to_id)
  const strays = existingRows.filter(
    (e) => !refunds.some((r) => r.userId === e.to_id)
  )
  if (strays.length > 0) {
    throw new Error(
      `Payments in ${GROUP_ID} to accounts not on the list: ` +
        strays.map((e) => e.to_id).join(', ')
    )
  }
  const alreadyPaid = new Set(
    refunds
      .filter((r) => checkExisting(r, existingByUser[r.userId] ?? []))
      .map((r) => r.userId)
  )
  const toPay = refunds.filter((r) => !alreadyPaid.has(r.userId))

  for (const r of refunds) {
    const status = alreadyPaid.has(r.userId) ? 'already paid' : ''
    const renamed =
      usernames[r.userId] !== r.username ? `(now @${usernames[r.userId]})` : ''
    console.log(
      `${r.username.padEnd(20)} lost ${r.loss.toFixed(2).padStart(8)}` +
        `  pay M$${String(r.amount).padStart(5)}  ${status}${renamed}`
    )
  }
  const total = sumBy(toPay, 'amount')
  console.log(
    `\n${refunds.length} accounts, M$${EXPECTED_TOTAL} in all.` +
      ` To pay now: ${toPay.length} accounts, M$${total}.` +
      ` @${house.username} balance: M$${Math.floor(house.balance)}.`
  )
  if (house.balance < total) throw new Error('House balance too low')

  if (!apply) {
    console.log('Dry run. Re-run with --apply to pay.')
    return
  }

  let paid = 0
  for (const r of toPay) {
    const updates: UserUpdate[] = []
    const didPay = await pg.tx(async (tx) => {
      // Serialize concurrent runs of this script: the second run waits here,
      // then its lookup (a new statement under READ COMMITTED) sees the
      // first run's committed payment.
      // (one(), not none(): the select returns a single void row.)
      await tx.one(`select pg_advisory_xact_lock(hashtext($1))`, [GROUP_ID])
      const existing = await tx.manyOrNone<ExistingPayment>(
        `select to_id, amount, token from txns
          where category = 'MANA_PAYMENT'
            and from_id = $1
            and to_id = $2
            and data->'data'->>'groupId' = $3`,
        [HOUSE_LIQUIDITY_PROVIDER_ID, r.userId, GROUP_ID]
      )
      if (checkExisting(r, existing)) return false
      await runTxnOutsideBetQueue(
        tx,
        {
          category: 'MANA_PAYMENT',
          fromType: 'USER',
          fromId: HOUSE_LIQUIDITY_PROVIDER_ID,
          toType: 'USER',
          toId: r.userId,
          amount: r.amount,
          token: 'M$',
          data: { message: MESSAGE, visibility: 'public', groupId: GROUP_ID },
          description: MESSAGE,
        },
        false,
        (u) => updates.push(...u)
      )
      return true
    })
    if (!didPay) {
      console.log(`Skipped @${r.username}: already paid`)
      continue
    }
    broadcastUserUpdates(updates)
    paid += r.amount
    console.log(`Paid @${r.username} M$${r.amount}`)
    try {
      await createManaPaymentNotification(
        house,
        r.userId,
        r.amount,
        MESSAGE,
        'M$'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`  notification failed for @${r.username}: ${message}`)
    }
  }
  console.log(`\nDone. Paid M$${paid}.`)
})
