import { createPerp } from 'api/create-perp'
import { APIError } from 'common/api/utils'
import { insertOraclePrices } from 'shared/oracle'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import {
  closePosition,
  openOrAddPosition,
  resolvePerp,
  runOracleUpdate,
} from 'shared/perps/engine'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Scratch-feed QA drill for the perps launch checklist (§5 of
// perps-review-handoff.md). Uses throwaway feeds that are NOT in the
// oracle-feeds registry, so neither the deployed scheduler nor any local
// tick loop will touch these markets — every price move here is explicit.
//
// Phases:
//   B. forced liquidation + notification content
//   C. engineered ADL + notification content (only scaled users notified)
//   D. resolve: settle-at-oracle, residual to creator, double-resolve blocked
//   E. freshness gate: opens AND closes 400 on a stale feed
//   F. concurrency: parallel opens + oracle updates under the advisory lock
//
// Dev-only accounts (from common/envs/dev.ts adminIds):
const DEV_MANIFOLD = 'MxyCh2xvsFMFywwjg3Az0w4xP5B3' // creator/admin
const GENZY = 'TabB6gJMYEUfaNWNS8i84PvMi2r2'
const DEVZY = '4MdwzxkOwcWq5zLoIFx5MSJCAaD2'

const STAMP = Math.floor(Date.now() / 1000) // uniquify feeds per run

let passes = 0
let failures = 0
const check = (cond: boolean, name: string, detail?: string) => {
  if (cond) {
    passes++
    log(`  PASS ${name}`)
  } else {
    failures++
    log.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const expectApiError = async (
  name: string,
  fn: () => Promise<unknown>,
  msgFragment: string
) => {
  try {
    await fn()
    check(false, name, 'expected APIError, call succeeded')
  } catch (e) {
    const ok =
      e instanceof APIError &&
      e.message.toLowerCase().includes(msgFragment.toLowerCase())
    check(ok, name, ok ? undefined : `got: ${(e as Error).message}`)
  }
}

if (require.main === module)
  runScript(async ({ pg }) => {
    const balances = await pg.manyOrNone(
      `select id, username, balance from users where id in ($1, $2, $3)`,
      [DEV_MANIFOLD, GENZY, DEVZY]
    )
    for (const b of balances)
      log(`balance ${b.username}: ${Math.round(b.balance)}`)
    if (balances.some((b) => b.balance < 5000))
      throw new Error('a drill account has <5000 mana — top up first')

    const makeMarket = async (
      tag: string,
      feedId: string,
      opts: Partial<{
        maxOraclePriceAgeMs: number
        subsidyLong: number
        subsidyShort: number
      }> = {}
    ) => {
      const res = await createPerp(
        {
          question: `PERP DRILL ${STAMP}: ${tag} (scratch, ignore)`,
          description: 'Automated QA drill market. Ignore.',
          visibility: 'unlisted',
          oracleFeedId: feedId,
          maxLeverage: 100,
          maxFundingRate: 0.001,
          fundingSensitivity: 10,
          maxOraclePriceAgeMs: opts.maxOraclePriceAgeMs ?? 10 * 60 * 1000,
          subsidyLong: opts.subsidyLong ?? 500,
          subsidyShort: opts.subsidyShort ?? 500,
        } as any,
        { uid: DEV_MANIFOLD } as any,
        {} as any
      )
      const market = 'result' in res ? (res as any).result : (res as any)
      log(`created ${tag}: ${market.id} (${market.url ?? market.slug})`)
      return market.id as string
    }

    // ---------------- Phase B: forced liquidation ----------------
    log('=== B. forced liquidation + notification ===')
    const feedB = `drill-liq-${STAMP}`
    await insertOraclePrices(pg, feedB, [
      { ts: Date.now() - 60_000, price: 100 },
      { ts: Date.now(), price: 100 },
    ])
    const m1 = await makeMarket('liquidation', feedB)

    await openOrAddPosition(m1, GENZY, 'long', 200, 50) // liq at 98
    const posB = await pg.oneOrNone(
      `select size, liquidation_price from contract_perp_positions
       where contract_id = $1 and user_id = $2 and direction = 'long'`,
      [m1, GENZY]
    )
    check(
      !!posB && Number(posB.size) === 10000,
      'B: 50x long opened (10k notional)'
    )
    check(
      !!posB && Math.abs(Number(posB.liquidation_price) - 98) < 1e-6,
      'B: liquidation price = 98'
    )

    const poolBeforeLiq = await pg.one(
      `select (data->>'poolLong')::numeric as l, (data->>'poolShort')::numeric as s
       from contracts where id = $1`,
      [m1]
    )

    const tsB = Date.now()
    await insertOraclePrices(pg, feedB, [{ ts: tsB, price: 97.5 }])
    const resB = await runOracleUpdate(m1, 97.5, tsB)
    check(
      !!resB &&
        resB.liquidated.length === 1 &&
        resB.liquidated[0].userId === GENZY,
      'B: one liquidation, right user'
    )
    const poolAfterLiq = await pg.one(
      `select (data->>'poolLong')::numeric as l, (data->>'poolShort')::numeric as s
       from contracts where id = $1`,
      [m1]
    )
    check(
      Number(poolAfterLiq.l) === Number(poolBeforeLiq.l) &&
        Number(poolAfterLiq.s) === Number(poolBeforeLiq.s),
      'B: pools unchanged by liquidation (margin forfeited in place)',
      `before L=${poolBeforeLiq.l} S=${poolBeforeLiq.s} after L=${poolAfterLiq.l} S=${poolAfterLiq.s}`
    )
    const goneB = await pg.oneOrNone(
      `select 1 from contract_perp_positions
       where contract_id = $1 and user_id = $2 and size > 0`,
      [m1, GENZY]
    )
    check(!goneB, 'B: position row gone')

    const fullContractB = (
      await pg.one(`select data from contracts where id = $1`, [m1])
    ).data
    if (resB) await notifyPerpOracleResult(pg, fullContractB, 97.5, resB)
    const notifRow = await pg.oneOrNone(
      `select data->>'sourceText' as text from user_notifications
       where user_id = $1 and data->>'reason' = 'perp_liquidation'
         and data->>'sourceContractId' = $2
       order by (data->>'createdTime')::bigint desc limit 1`,
      [GENZY, m1]
    )
    check(
      !!notifRow &&
        notifRow.text.includes('200') &&
        notifRow.text.toLowerCase().includes('liquidat'),
      'B: liquidation notification delivered with margin amount',
      notifRow?.text?.slice(0, 120) ?? 'no notification row'
    )

    // ---------------- Phase C: engineered ADL ----------------
    log('=== C. engineered ADL + notification ===')
    const feedC = `drill-adl-${STAMP}`
    await insertOraclePrices(pg, feedC, [{ ts: Date.now(), price: 100 }])
    const m2 = await makeMarket('adl', feedC, {
      subsidyLong: 50,
      subsidyShort: 50,
    })
    await openOrAddPosition(m2, GENZY, 'long', 500, 20) // 10k notional @ 100
    // A short from a second user, so we can assert they are NOT notified.
    await openOrAddPosition(m2, DEVZY, 'short', 100, 2) // 200 notional @ 100

    const tsC = Date.now()
    await insertOraclePrices(pg, feedC, [{ ts: tsC, price: 130 }])
    const resC = await runOracleUpdate(m2, 130, tsC)
    // E_long = 0.3 * 10000 = 3000 > S - C_short. Expect factor << 1.
    check(
      !!resC && resC.adlFactorLong < 0.2 && resC.adlFactorLong > 0,
      'C: adlFactorLong deep haircut',
      `factor=${resC?.adlFactorLong}`
    )
    check(
      !!resC &&
        resC.adlAdjusted.length === 1 &&
        resC.adlAdjusted[0].position.userId === GENZY,
      'C: only the profitable long was scaled'
    )
    const posC = await pg.one(
      `select size, cost_basis from contract_perp_positions
       where contract_id = $1 and user_id = $2 and direction = 'long'`,
      [m2, GENZY]
    )
    check(
      Number(posC.cost_basis) === 500,
      'C: cost basis untouched by ADL',
      `cost_basis=${posC.cost_basis}`
    )
    const fullContractC = (
      await pg.one(`select data from contracts where id = $1`, [m2])
    ).data
    if (resC) await notifyPerpOracleResult(pg, fullContractC, 130, resC)
    const adlNotif = await pg.oneOrNone(
      `select data->>'sourceText' as text from user_notifications
       where user_id = $1 and data->>'reason' = 'perp_adl'
         and data->>'sourceContractId' = $2
       order by (data->>'createdTime')::bigint desc limit 1`,
      [GENZY, m2]
    )
    check(
      !!adlNotif &&
        adlNotif.text.includes('->') &&
        adlNotif.text.includes('reduced'),
      'C: ADL notification with before->after sizes',
      adlNotif?.text?.slice(0, 140) ?? 'no notification row'
    )
    const devzyAdlNotif = await pg.oneOrNone(
      `select 1 from user_notifications
       where user_id = $1 and data->>'reason' = 'perp_adl'
         and data->>'sourceContractId' = $2`,
      [DEVZY, m2]
    )
    check(!devzyAdlNotif, 'C: unscaled short user NOT notified')

    // ---------------- Phase D: resolve ----------------
    log('=== D. resolve + double-resolve block ===')
    const resolveRes = await resolvePerp(m2, DEV_MANIFOLD)
    check(
      Math.abs(resolveRes.finalPrice - 130) < 1e-9,
      'D: settled at latest oracle price'
    )
    // Expected: ADL scaled GENZY's long so its profit ≈ S − C_short.
    // S = 50 subsidy + 100 short margin = 150; short value at 130 is 40, so
    // C = 40 and capped profit ≈ 110 → payout ≈ cost 500 + 110 = 610.
    const genzyPayout =
      resolveRes.closedPositions.find((p) => p.userId === GENZY)?.payout ?? 0
    check(
      genzyPayout > 550 && genzyPayout < 650,
      'D: ADL-scaled winner paid cost + capped profit (~610)',
      `payout=${genzyPayout}`
    )
    check(resolveRes.residualPayout >= 0, 'D: non-negative residual to creator')
    await expectApiError(
      'D: second resolve blocked',
      () => resolvePerp(m2, DEV_MANIFOLD),
      'resolved'
    )
    await expectApiError(
      'D: trade on resolved market blocked',
      () => openOrAddPosition(m2, DEVZY, 'long', 10, 2),
      'resolved'
    )

    // ---------------- Phase E: freshness gate ----------------
    log('=== E. freshness gate (stale feed blocks open AND close) ===')
    const feedE = `drill-stale-${STAMP}`
    await insertOraclePrices(pg, feedE, [{ ts: Date.now(), price: 100 }])
    const m3 = await makeMarket('stale-gate', feedE, {
      maxOraclePriceAgeMs: 15_000,
    })
    await openOrAddPosition(m3, DEVZY, 'long', 100, 5) // fresh: works
    log('  waiting 20s for the feed to go stale...')
    await new Promise((r) => setTimeout(r, 20_000))
    await expectApiError(
      'E: open blocked on stale feed',
      () => openOrAddPosition(m3, GENZY, 'long', 100, 5),
      'stale'
    )
    await expectApiError(
      'E: close blocked on stale feed',
      () => closePosition(m3, DEVZY, 'long'),
      'stale'
    )

    // ---------------- Phase F: concurrency ----------------
    log('=== F. concurrent trades + oracle updates ===')
    const poolBeforeF = await pg.one(
      `select (data->>'poolLong')::numeric as l, (data->>'poolShort')::numeric as s
       from contracts where id = $1`,
      [m1]
    )
    const tsF = Date.now()
    await insertOraclePrices(pg, feedB, [{ ts: tsF, price: 97.6 }])
    const results = await Promise.allSettled([
      openOrAddPosition(m1, GENZY, 'long', 100, 3),
      openOrAddPosition(m1, GENZY, 'long', 100, 3), // concurrent add
      openOrAddPosition(m1, DEVZY, 'short', 100, 3),
      openOrAddPosition(m1, DEVZY, 'short', 100, 3), // concurrent add
      runOracleUpdate(m1, 97.6, tsF),
      runOracleUpdate(m1, 97.6, tsF), // duplicate tick
    ])
    const rejected = results.filter((r) => r.status === 'rejected')
    check(
      rejected.length === 0,
      'F: all concurrent ops completed (retries absorbed)',
      rejected.map((r: any) => r.reason?.message).join('; ')
    )
    const poolAfterF = await pg.one(
      `select (data->>'poolLong')::numeric as l, (data->>'poolShort')::numeric as s
       from contracts where id = $1`,
      [m1]
    )
    check(
      Math.abs(Number(poolAfterF.l) - (Number(poolBeforeF.l) + 200)) < 1e-6 &&
        Math.abs(Number(poolAfterF.s) - (Number(poolBeforeF.s) + 200)) < 1e-6,
      'F: pools = before + exactly the margins deposited (no lost/double writes)',
      `L ${poolBeforeF.l}->${poolAfterF.l}, S ${poolBeforeF.s}->${poolAfterF.s}`
    )
    const posF = await pg.manyOrNone(
      `select user_id, direction, size, cost_basis from contract_perp_positions
       where contract_id = $1 and size > 0 order by user_id`,
      [m1]
    )
    const genzyF = posF.find((p) => p.user_id === GENZY)
    const devzyF = posF.find((p) => p.user_id === DEVZY)
    check(
      !!genzyF && Math.abs(Number(genzyF.cost_basis) - 200) < 1e-6,
      'F: concurrent adds merged into one position (cost 200)',
      `got ${genzyF?.cost_basis}`
    )
    check(
      !!devzyF && Math.abs(Number(devzyF.cost_basis) - 200) < 1e-6,
      'F: concurrent short adds merged (cost 200)',
      `got ${devzyF?.cost_basis}`
    )

    // ---------------- cleanup ----------------
    log('=== cleanup: resolving drill markets ===')
    await resolvePerp(m1, DEV_MANIFOLD)
    // m3 feed is stale; resolvePerp settles at latest row by design — fine.
    await resolvePerp(m3, DEV_MANIFOLD)

    log(`==== DRILL COMPLETE: ${passes} passed, ${failures} failed ====`)
    if (failures > 0) process.exitCode = 1
  })
