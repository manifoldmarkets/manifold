import * as admin from 'firebase-admin'
import { Request } from 'express'

import { createPerp } from 'api/create-perp'
import { AuthedUser } from 'api/helpers/endpoint'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { getUnrealizedEquity } from 'common/perps/amm'

import { randomString } from 'common/util/random'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { insertOraclePrices } from 'shared/oracle'
import { ORACLE_FEEDS } from 'shared/oracle-feeds'
import {
  closePosition,
  openOrAddPosition,
  resolvePerp,
  runOracleUpdate,
} from 'shared/perps/engine'
import { log } from 'shared/utils'

import { runScript } from './run-script'

// DEV-only live test of ONE question: does adding to an existing position
// conserve value?
//
// It runs two economically identical traders through the real API/engine on
// two identical disposable markets:
//
//   ADDER   open short, price falls, ADD at the new price, close everything.
//   CONTROL open short, price falls, CLOSE, then open an identical new short
//           at the new price and close it immediately.
//
// Both deposit the same mana, hold the same exposure over the same price
// path, and end flat at the same price. The only difference is whether the
// second tranche was merged into an existing position or held separately.
// Their final balances must match. Any gap is mana created or destroyed by
// the merge itself.
//
// The added/second tranche is opened AND closed at the same price, so it has
// exactly zero P&L by construction. That makes the expected payout readable
// without any model of the AMM: it is "position value before the add" plus
// "the mana you just added".
//
// Usage:
//   npx.cmd ts-node perp-add-conservation-test.ts
//   npx.cmd ts-node perp-add-conservation-test.ts --apply --confirm=PERP_ADD_TEST
//
// Apply mode moves real DEV balances and permanently appends oracle rows for
// two disposable synthetic feeds. It resolves both markets when finished.

const DEV_MANIFOLD = 'MxyCh2xvsFMFywwjg3Az0w4xP5B3'
const TRADER = 'TabB6gJMYEUfaNWNS8i84PvMi2r2'
const CONFIRMATION = '--confirm=PERP_ADD_TEST'
const APPLY = process.argv.includes('--apply')
const STAMP = `${Date.now()}-${randomString(4)}`

// Deliberately large price move. The distortion is QUADRATIC in the move
// (see the closed form printed at the end), so a 1% BTC wiggle hides it and
// a 2x move makes it obvious.
const PRICE_OPEN = 100
const PRICE_ADD = 50
const MANA = 100
const LEVERAGE = 10
const SUBSIDY = 50_000

const scriptAuth: AuthedUser = {
  uid: DEV_MANIFOLD,
  creds: {
    kind: 'jwt',
    data: { user_id: DEV_MANIFOLD } as unknown as admin.auth.DecodedIdToken,
  },
}
const scriptRequest = {} as Request

const money = (n: number) => `M$${n.toFixed(4)}`

if (require.main === module)
  runScript(async ({ pg }) => {
    const projectId = admin.app().options.projectId
    if (
      ENV !== 'DEV' ||
      projectId !== ENV_CONFIG.firebaseConfig.projectId ||
      projectId !== 'dev-mantic-markets'
    ) {
      throw new Error(
        `Refusing to run outside DEV (ENV=${ENV}, project=${projectId})`
      )
    }

    // Stay clear of the hourly update-perps tick, which would apply funding
    // and muddy the comparison.
    const now = new Date()
    const minutesToNextHour =
      60 - (now.getUTCMinutes() + now.getUTCSeconds() / 60)
    if (APPLY && minutesToNextHour < 10)
      throw new Error(
        `Only ${minutesToNextHour.toFixed(
          1
        )} minutes until the hourly scheduler tick; rerun shortly after the hour`
      )

    if (!APPLY || !process.argv.includes(CONFIRMATION)) {
      log('DRY RUN. This script would, on DEV only:')
      log(`  1. create two disposable unlisted PERPs at price ${PRICE_OPEN}`)
      log(`  2. open M$${MANA} short at ${LEVERAGE}x on each`)
      log(`  3. publish a new oracle price of ${PRICE_ADD}`)
      log(`  4. ADDER: add M$${MANA} short, then close everything`)
      log(`     CONTROL: close, then open+close an identical M$${MANA} short`)
      log('  5. compare final balances and resolve both markets')
      log('')
      log(`Rerun with: --apply ${CONFIRMATION}`)
      return
    }

    const createdMarkets: { id: string; feedId: string }[] = []

    const loadBalance = async (userId: string) =>
      Number(
        (
          await pg.one<{ balance: number | string }>(
            `select balance from users where id = $1`,
            [userId]
          )
        ).balance
      )

    const loadPools = async (contractId: string) => {
      const row = await pg.one<{ pool_long: string; pool_short: string }>(
        `select data->>'poolLong' as pool_long,
                data->>'poolShort' as pool_short
         from contracts where id = $1`,
        [contractId]
      )
      return { L: Number(row.pool_long), S: Number(row.pool_short) }
    }

    const loadPosition = async (contractId: string, userId: string) => {
      const row = await pg.oneOrNone<{
        size: string
        cost_basis: string
        entry_price: string
        direction: string
      }>(
        `select size::text, cost_basis::text, entry_price::text, direction
         from contract_perp_positions
         where contract_id = $1 and user_id = $2 and size > 0`,
        [contractId, userId]
      )
      return row
        ? {
            direction: row.direction as 'long' | 'short',
            size: Number(row.size),
            costBasis: Number(row.cost_basis),
            entryPrice: Number(row.entry_price),
          }
        : null
    }

    const createScratchMarket = async (tag: string) => {
      const feedId = `perp-add-test-${STAMP}-${tag}`
      if (ORACLE_FEEDS.some((f) => f.id === feedId))
        throw new Error(`Duplicate process-local feed ${feedId}`)

      // Process-local only — never added to the deployed registry.
      ORACLE_FEEDS.push({
        id: feedId,
        description: `Disposable add-conservation test: ${tag}`,
        marketCreationEnabled: true,
        cadence: 'daily',
        minPrice: 1,
        maxPrice: 1_000,
        staleAfterMs: 30 * MINUTE_MS,
        updatePeriodMs: HOUR_MS,
      })

      const ts = Date.now()
      await insertOraclePrices(pg, feedId, [{ ts, price: PRICE_OPEN }])

      const created = await createPerp(
        {
          question: `PERP ADD TEST ${STAMP}: ${tag} (scratch; ignore)`,
          description: 'Disposable add-conservation test. Resolved by script.',
          visibility: 'unlisted',
          oracleFeedId: feedId,
          maxLeverage: 100,
          maxFundingRate: 0.001,
          fundingSensitivity: 10,
          maxOraclePriceAgeMs: 30 * MINUTE_MS,
          subsidyLong: SUBSIDY,
          subsidyShort: SUBSIDY,
        },
        scriptAuth,
        scriptRequest
      )
      if (!created || !('result' in created))
        throw new Error(`createPerp returned nothing for ${tag}`)
      createdMarkets.push({ id: created.result.id, feedId })
      log(`created ${tag}: ${created.result.id}`)
      return { id: created.result.id, feedId }
    }

    const publishPrice = async (
      market: { id: string; feedId: string },
      price: number
    ) => {
      const ts = Date.now()
      await insertOraclePrices(pg, market.feedId, [{ ts, price }])
      await runOracleUpdate(market.id, price, ts)
      log(`published price ${price} to ${market.id}`)
    }

    try {
      // Each market's whole lifecycle is measured as a single net balance
      // delta, so every deposit and every payout is inside the window. That
      // is the only apples-to-apples comparison.

      // ---------------------------- ADDER ---------------------------------
      log('')
      log('=== MARKET A (ADDER): open -> price falls -> ADD -> close ===')
      const adderMkt = await createScratchMarket('adder')
      const adderBal0 = await loadBalance(TRADER)

      await openOrAddPosition(
        adderMkt.id,
        TRADER,
        'short',
        MANA,
        LEVERAGE,
        randomString(10)
      )
      const openedA = await loadPosition(adderMkt.id, TRADER)
      log(
        `  opened: size=${openedA?.size} entry=${openedA?.entryPrice} costBasis=${openedA?.costBasis}`
      )

      await publishPrice(adderMkt, PRICE_ADD)

      const posBeforeAdd = await loadPosition(adderMkt.id, TRADER)
      if (!posBeforeAdd) throw new Error('adder position vanished')
      const equityBeforeAdd = getUnrealizedEquity(
        { ...posBeforeAdd, userId: TRADER, contractId: adderMkt.id } as any,
        PRICE_ADD
      )
      const valueBeforeAdd = posBeforeAdd.costBasis + equityBeforeAdd
      log(
        `  value BEFORE the add: ${money(valueBeforeAdd)} (costBasis ${
          posBeforeAdd.costBasis
        } + equity ${equityBeforeAdd.toFixed(4)})`
      )

      const poolsABefore = await loadPools(adderMkt.id)
      await openOrAddPosition(
        adderMkt.id,
        TRADER,
        'short',
        MANA,
        LEVERAGE,
        randomString(10)
      )
      const merged = await loadPosition(adderMkt.id, TRADER)
      log(
        `  after add: size=${merged?.size} entry=${merged?.entryPrice} costBasis=${merged?.costBasis}`
      )
      log(
        `    (value-conserving entry price would be ${(
          (posBeforeAdd.size + MANA * LEVERAGE) /
          (posBeforeAdd.size / posBeforeAdd.entryPrice +
            (MANA * LEVERAGE) / PRICE_ADD)
        ).toFixed(6)})`
      )

      const balBeforeAClose = await loadBalance(TRADER)
      await closePosition(adderMkt.id, TRADER, 'short', randomString(10))
      const adderClosePayout = (await loadBalance(TRADER)) - balBeforeAClose
      const poolsAAfter = await loadPools(adderMkt.id)
      const adderNet = (await loadBalance(TRADER)) - adderBal0

      log(`  close payout: ${money(adderClosePayout)}`)
      log(
        `  expected if the add conserved value: ${money(
          valueBeforeAdd + MANA
        )}  (value before add + the M$${MANA} added)`
      )
      log(
        `  long pool: ${poolsABefore.L.toFixed(4)} -> ${poolsAAfter.L.toFixed(
          4
        )}`
      )
      log(`  NET for market A: ${money(adderNet)} on M$${2 * MANA} deposited`)

      // --------------------------- CONTROL --------------------------------
      log('')
      log(
        '=== MARKET B (CONTROL): open -> price falls -> close -> open -> close ==='
      )
      const controlMkt = await createScratchMarket('control')
      const controlBal0 = await loadBalance(TRADER)

      await openOrAddPosition(
        controlMkt.id,
        TRADER,
        'short',
        MANA,
        LEVERAGE,
        randomString(10)
      )
      await publishPrice(controlMkt, PRICE_ADD)
      await closePosition(controlMkt.id, TRADER, 'short', randomString(10))
      const afterFirstClose = await loadBalance(TRADER)
      log(`  first close: net so far ${money(afterFirstClose - controlBal0)}`)

      // Second tranche held separately instead of merged — same mana, same
      // price, opened and closed at the same price, so zero P&L.
      await openOrAddPosition(
        controlMkt.id,
        TRADER,
        'short',
        MANA,
        LEVERAGE,
        randomString(10)
      )
      await closePosition(controlMkt.id, TRADER, 'short', randomString(10))
      const controlNet = (await loadBalance(TRADER)) - controlBal0
      log(`  NET for market B: ${money(controlNet)} on M$${2 * MANA} deposited`)

      // ---------------------------- Verdict -------------------------------
      log('')
      log('=== RESULT ===')
      log(
        `Both traders deposited M$${
          2 * MANA
        } and held the same exposure over the same price path.`
      )
      log(`  A (merged via ADD):      net ${money(adderNet)}`)
      log(`  B (tranches separate):   net ${money(controlNet)}`)
      const gap = adderNet - controlNet
      log('')
      log(`GAP: ${money(gap)}`)
      log(
        gap > 0.0001
          ? `>>> The merge CREATED ${money(gap)} out of nothing.`
          : gap < -0.0001
          ? `>>> The merge DESTROYED ${money(-gap)}.`
          : '>>> Value conserved.'
      )

      // Magnitude the arithmetic-mean merge would have produced, for
      // reference. After the fix the gap should be 0 and this is just the
      // size of the regression this test guards against.
      const q1 = MANA * LEVERAGE
      const q2 = MANA * LEVERAGE
      const r = PRICE_ADD / PRICE_OPEN
      const preFix = (q1 * q2 * (1 - r) ** 2) / (q1 + r * q2)
      log('')
      log(
        `for reference, the arithmetic-mean merge would have moved ${money(
          preFix
        )} here (q1*q2*(1-r)^2 / (q1 + r*q2), q1=${q1} q2=${q2} r=${r})`
      )
      if (Math.abs(gap) > 0.0001)
        throw new Error(
          `Value conservation FAILED: adds moved ${money(gap)} that they should not have`
        )
    } finally {
      log('')
      log('=== CLEANUP ===')
      for (const m of createdMarkets) {
        try {
          await resolvePerp(m.id, DEV_MANIFOLD)
          log(`resolved ${m.id}`)
        } catch (e) {
          log.error(`failed to resolve ${m.id}: ${e}`)
        }
      }
    }
  })
