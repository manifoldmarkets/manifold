import * as admin from 'firebase-admin'
import { Request } from 'express'

import { createPerp } from 'api/create-perp'
import { AuthedUser } from 'api/helpers/endpoint'
import { APIError } from 'common/api/utils'
import { PerpContract } from 'common/contract'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { NotificationReason } from 'common/notification'
import { isPerpEscrowBalanced } from 'common/perps/escrow'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { randomString } from 'common/util/random'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { insertOraclePrices } from 'shared/oracle'
import { ORACLE_FEEDS } from 'shared/oracle-feeds'
import {
  closePosition,
  openOrAddPosition,
  resolvePerp,
  runFunding,
  runOracleUpdate,
} from 'shared/perps/engine'
import { calculatePerpPeriodMetricUpdates } from 'shared/perps/user-contract-metric-periods'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import { getEffectiveCurrentSeason } from 'shared/supabase/leagues'
import { getPrivateUser, log } from 'shared/utils'

import { runScript } from './run-script'

// Destructive DEV-only launch drill. The default invocation is read-only.
//
// Apply mode creates four unlisted disposable markets on process-local
// synthetic feed definitions, exercises the authoritative engine, then
// resolves every market it created. The definitions are intentionally never
// added to the deployed registry. The current deployed hourly fallback job
// still scans every unresolved PERP, including unknown feeds, so apply mode
// also enforces a guarded window between hourly ticks. The scheduler code now
// refuses unknown feeds, but this guard remains until that change is deployed.
//
// Usage:
//   npx.cmd ts-node perp-scratch-drill.ts
//   npx.cmd ts-node perp-scratch-drill.ts --apply --confirm=PERP_DEV_DRILL
//
// Apply mode deliberately changes the balances of the three DEV accounts
// below. Liquidation and profitable ADL/settlement are real transfers; this is
// why the environment guard and explicit confirmation are both required.

const DEV_MANIFOLD = 'MxyCh2xvsFMFywwjg3Az0w4xP5B3'
const GENZY = 'TabB6gJMYEUfaNWNS8i84PvMi2r2'
const DEVZY = '4MdwzxkOwcWq5zLoIFx5MSJCAaD2'
const DRILL_USERS = [GENZY, DEVZY]
const ALL_ACCOUNTS = [DEV_MANIFOLD, ...DRILL_USERS]
const CONFIRMATION = '--confirm=PERP_DEV_DRILL'
const APPLY = process.argv.includes('--apply')
const STAMP = `${Date.now()}-${randomString(4)}`
const QUESTION_PREFIX = `PERP DEV DRILL ${STAMP}`

type DrillMarket = {
  id: string
  feedId: string
  lastOracleTime: number
}

type LeagueSnapshot = Record<
  string,
  {
    manaEarned: number
    breakdown: Record<string, unknown>
  }
>

type MetricFrom = {
  profit: number
  profitPercent: number
  invested: number
  prevValue: number
  value: number
}

type MetricData = {
  payout?: number
  profit?: number
  lastBetTime?: number
  from?: Partial<Record<'day' | 'week' | 'month', MetricFrom>>
}

const scriptAuth: AuthedUser = {
  uid: DEV_MANIFOLD,
  creds: {
    kind: 'jwt',
    data: {
      user_id: DEV_MANIFOLD,
    } as unknown as admin.auth.DecodedIdToken,
  },
}
const scriptRequest = {} as Request

let passes = 0
let failures = 0

const check = (condition: boolean, name: string, detail?: string) => {
  if (condition) {
    passes++
    log(`  PASS ${name}`)
  } else {
    failures++
    log.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const checkApprox = (
  actual: number,
  expected: number,
  name: string,
  tolerance = 1e-7
) =>
  check(
    Number.isFinite(actual) &&
      Number.isFinite(expected) &&
      Math.abs(actual - expected) <= tolerance,
    name,
    `actual=${actual}, expected=${expected}`
  )

const expectApiError = async (
  name: string,
  fn: () => Promise<unknown>,
  status: number,
  messageFragment: string
) => {
  try {
    await fn()
    check(false, name, 'expected APIError, call succeeded')
  } catch (error) {
    const ok =
      error instanceof APIError &&
      error.code === status &&
      error.message.toLowerCase().includes(messageFragment.toLowerCase())
    check(
      ok,
      name,
      ok
        ? undefined
        : `got ${
            error instanceof Error ? error.message : String(error)
          } (status ${
            error instanceof APIError ? error.code : 'not an APIError'
          })`
    )
  }
}

const idempotencyKey = () => randomString(10)
const metricKey = (userId: string, contractId: string) =>
  `${userId}\u0000${contractId}`

if (require.main === module)
  runScript(async ({ pg }) => {
    const projectId = admin.app().options.projectId
    if (
      ENV !== 'DEV' ||
      projectId !== ENV_CONFIG.firebaseConfig.projectId ||
      projectId !== 'dev-mantic-markets'
    ) {
      throw new Error(
        `DEV guard failed (ENV=${ENV}, Firebase=${projectId ?? 'missing'})`
      )
    }

    const unknownArgs = process.argv
      .slice(2)
      .filter((arg) => arg !== '--apply' && arg !== CONFIRMATION)
    if (unknownArgs.length > 0)
      throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`)
    if (APPLY !== process.argv.includes(CONFIRMATION))
      throw new Error(
        `Apply mode requires both --apply and ${CONFIRMATION}; omit both for a read-only inventory.`
      )

    const accounts = await pg.manyOrNone<{
      id: string
      username: string
      balance: number | string
    }>(
      `select id, username, balance
       from users
       where id = any($1::text[])
       order by username`,
      [ALL_ACCOUNTS]
    )
    if (accounts.length !== ALL_ACCOUNTS.length)
      throw new Error(
        `Expected ${ALL_ACCOUNTS.length} drill accounts, found ${accounts.length}`
      )
    for (const account of accounts)
      log(
        `account ${account.username} (${account.id}): M$${Number(
          account.balance
        ).toFixed(2)}`
      )

    const orphaned = await pg.manyOrNone<{
      id: string
      slug: string
      question: string
      feed_id: string
    }>(
      `select id, slug, question, data->>'oracleFeedId' as feed_id
       from contracts
       where mechanism = 'perp'
         and resolution_time is null
         and question like 'PERP DEV DRILL %'
       order by created_time`
    )
    if (orphaned.length > 0) {
      for (const orphan of orphaned)
        log.error(
          `unresolved prior drill market: ${orphan.id} ${orphan.slug} (${orphan.feed_id})`
        )
      throw new Error(
        'Resolve the prior drill markets above before starting another run.'
      )
    }

    const season = await getEffectiveCurrentSeason()
    const requiredBrowserReasons: Record<string, NotificationReason[]> = {
      [GENZY]: [
        'perp_liquidation',
        'perp_adl',
        'resolutions_on_watched_markets_with_shares_in',
      ],
      [DEVZY]: ['resolutions_on_watched_markets_with_shares_in'],
    }
    const disabledBrowserNotifications: string[] = []
    for (const userId of DRILL_USERS) {
      const privateUser = await getPrivateUser(userId, pg)
      if (!privateUser) throw new Error(`Private user ${userId} is missing`)
      for (const reason of requiredBrowserReasons[userId]) {
        if (
          !getNotificationDestinationsForUser(privateUser, reason).sendToBrowser
        )
          disabledBrowserNotifications.push(`${userId}:${reason}`)
      }
    }
    log(
      disabledBrowserNotifications.length === 0
        ? 'browser notification prerequisites: ready'
        : `browser notification prerequisites disabled: ${disabledBrowserNotifications.join(
            ', '
          )}`
    )

    const leagueRows = await pg.manyOrNone<{
      user_id: string
      mana_earned: number | string
      mana_earned_breakdown: Record<string, unknown> | null
    }>(
      `select user_id, mana_earned, mana_earned_breakdown
       from leagues
       where season = $1
         and user_id = any($2::text[])`,
      [season, DRILL_USERS]
    )
    log(
      `active league season ${season}: ${leagueRows.length}/${DRILL_USERS.length} drill traders enrolled`
    )
    const orphanedLeagueRows = await pg.manyOrNone<{
      id: string
      user_id: string
    }>(
      `select id, user_id
       from leagues
       where season = $1
         and cohort = 'perp-dev-drill'`,
      [season]
    )
    if (orphanedLeagueRows.length > 0) {
      for (const row of orphanedLeagueRows)
        log.error(
          `orphaned temporary league row: ${row.id} user=${row.user_id}`
        )
      throw new Error(
        'Remove the orphaned perp-dev-drill league rows above before applying another run.'
      )
    }

    if (!APPLY) {
      log(
        `READ-ONLY: prerequisites inspected; apply mode will temporarily enroll missing drill traders, then remove those rows. Re-run with --apply ${CONFIRMATION} to create, exercise, and resolve disposable markets.`
      )
      return
    }

    if (accounts.some((account) => Number(account.balance) < 10_000))
      throw new Error('Every drill account must have at least M$10,000')
    if (disabledBrowserNotifications.length > 0)
      throw new Error(
        `Required browser notifications are disabled: ${disabledBrowserNotifications.join(
          ', '
        )}`
      )

    const startedAt = Date.now()
    const elapsedInHour = startedAt % HOUR_MS
    const nextHourlyTick = startedAt - elapsedInHour + HOUR_MS
    const minutesAfterHour = elapsedInHour / MINUTE_MS
    const minutesUntilNextHour = (nextHourlyTick - startedAt) / MINUTE_MS
    if (minutesAfterHour < 5 || minutesUntilNextHour < 20)
      throw new Error(
        `Unsafe hourly-scheduler window: ${minutesAfterHour.toFixed(
          1
        )} minutes after the hour and ${minutesUntilNextHour.toFixed(
          1
        )} minutes before the next tick. Apply only from :05 through :39 UTC.`
      )
    const mutationDeadline = nextHourlyTick - 10 * MINUTE_MS
    const assertSchedulerIsolationWindow = (operation: string) => {
      if (Date.now() >= mutationDeadline)
        throw new Error(
          `Aborting before ${operation}: the hourly scheduler safety deadline was reached`
        )
    }
    log(
      `hourly scheduler isolation window: ${minutesUntilNextHour.toFixed(
        1
      )} minutes until the next tick; mutations must finish by ${new Date(
        mutationDeadline
      ).toISOString()}`
    )

    // update-user-metric-periods computes a module-level DEV/PROD chunk size
    // through Firebase. Import it only after runScript has initialized the
    // admin app; a static import fails before even read-only mode can run.
    const [
      { updateUserMetricPeriods },
      { updateLeague },
      { resolveMarketMain },
    ] = await Promise.all([
      import('shared/update-user-metric-periods'),
      import('scheduler/jobs/update-league'),
      import('api/resolve-market'),
    ])

    const createdMarkets: DrillMarket[] = []
    const metricTargets: { userId: string; contractId: string }[] = []
    const temporaryLeagueRows: { id: string; userId: string }[] = []

    const loadContract = async (contractId: string) => {
      const row = await pg.one<{
        data: PerpContract
        token: string | null
        resolution_time: string | null
      }>(
        `select data, token, resolution_time
         from contracts
         where id = $1`,
        [contractId]
      )
      if (row.token !== 'MANA')
        throw new Error(
          `Drill market ${contractId} has token ${row.token ?? 'null'}`
        )
      return {
        contract: { ...row.data, token: row.token } as PerpContract,
        resolutionTime: row.resolution_time,
      }
    }

    const loadPools = async (contractId: string) => {
      const row = await pg.one<{ pool_long: string; pool_short: string }>(
        `select data->>'poolLong' as pool_long,
                data->>'poolShort' as pool_short
         from contracts
         where id = $1`,
        [contractId]
      )
      return { L: Number(row.pool_long), S: Number(row.pool_short) }
    }

    const loadBalance = async (userId: string) =>
      Number(
        (
          await pg.one<{ balance: number | string }>(
            `select balance from users where id = $1`,
            [userId]
          )
        ).balance
      )

    const loadLastBetTime = async (contractId: string) => {
      const row = await pg.one<{ last_bet_time: string | null }>(
        `select data->>'lastBetTime' as last_bet_time
         from contracts
         where id = $1`,
        [contractId]
      )
      return row.last_bet_time == null ? null : Number(row.last_bet_time)
    }

    const loadEscrowBalance = async (contractId: string) => {
      const { balance } = await pg.one<{ balance: number | string }>(
        `select
           coalesce(sum(
             case
               when to_type = 'CONTRACT' and to_id = $1 then amount
               when from_type = 'CONTRACT' and from_id = $1 then -amount
               else 0
             end
           ), 0) as balance
         from txns
         where token = 'M$'
           and (
             (to_type = 'CONTRACT' and to_id = $1)
             or (from_type = 'CONTRACT' and from_id = $1)
           )`,
        [contractId]
      )
      const numericBalance = Number(balance)
      if (!Number.isFinite(numericBalance))
        throw new Error(
          `Contract ${contractId} has non-finite escrow balance ${balance}`
        )
      return numericBalance
    }

    const assertEscrow = async (contractId: string, name: string) => {
      const [balance, pool] = await Promise.all([
        loadEscrowBalance(contractId),
        loadPools(contractId),
      ])
      check(
        isPerpEscrowBalanced({
          ledgerBalance: balance,
          poolLong: pool.L,
          poolShort: pool.S,
        }),
        name,
        `ledger=${balance}, L=${pool.L}, S=${pool.S}`
      )
    }

    const makeMarket = async (
      tag: string,
      options: {
        subsidyLong: number
        subsidyShort: number
        maxOraclePriceAgeMs?: number
      }
    ): Promise<DrillMarket> => {
      assertSchedulerIsolationWindow(`creating ${tag}`)
      const feedId = `perp-dev-drill-${STAMP}-${tag}`
      const maxOraclePriceAgeMs = options.maxOraclePriceAgeMs ?? 10 * 60 * 1000
      if (ORACLE_FEEDS.some((feed) => feed.id === feedId))
        throw new Error(`Duplicate process-local feed ${feedId}`)

      // Process-local capability only. This makes createPerp exercise its real
      // registry validation without introducing a deployed synthetic feed.
      ORACLE_FEEDS.push({
        id: feedId,
        description: `Disposable DEV launch drill: ${tag}`,
        marketCreationEnabled: true,
        cadence: 'daily',
        minPrice: 1,
        maxPrice: 1_000,
        staleAfterMs: maxOraclePriceAgeMs,
        updatePeriodMs: HOUR_MS,
      })

      const initialOracleTime = Date.now()
      await insertOraclePrices(pg, feedId, [
        { ts: initialOracleTime, price: 100 },
      ])
      const created = await createPerp(
        {
          question: `${QUESTION_PREFIX}: ${tag} (scratch; ignore)`,
          description:
            'Automated launch verification market. Unlisted and resolved by the same guarded DEV-only script.',
          visibility: 'unlisted',
          oracleFeedId: feedId,
          maxLeverage: 100,
          maxFundingRate: 0.001,
          fundingSensitivity: 10,
          maxOraclePriceAgeMs,
          subsidyLong: options.subsidyLong,
          subsidyShort: options.subsidyShort,
        },
        scriptAuth,
        scriptRequest
      )
      if (!created || !('result' in created))
        throw new Error(`createPerp did not return a market for ${tag}`)

      const market = {
        id: created.result.id,
        feedId,
        lastOracleTime: initialOracleTime,
      }
      createdMarkets.push(market)
      log(`created ${tag}: ${created.result.id} (${created.result.slug})`)
      await assertEscrow(market.id, `${tag}: creation escrow`)
      return market
    }

    const publishAndApply = async (
      market: DrillMarket,
      price: number,
      explicitTime?: number
    ) => {
      assertSchedulerIsolationWindow(`publishing ${market.feedId}`)
      const ts = Math.max(explicitTime ?? Date.now(), market.lastOracleTime + 1)
      await insertOraclePrices(pg, market.feedId, [{ ts, price }])
      market.lastOracleTime = ts
      return runOracleUpdate(market.id, price, ts)
    }

    const publishWithoutApplying = async (
      market: DrillMarket,
      price: number
    ) => {
      assertSchedulerIsolationWindow(`publishing ${market.feedId}`)
      const ts = Math.max(Date.now(), market.lastOracleTime + 1)
      await insertOraclePrices(pg, market.feedId, [{ ts, price }])
      market.lastOracleTime = ts
      return ts
    }

    const snapshotLeague = async (): Promise<LeagueSnapshot> => {
      const rows = await pg.manyOrNone<{
        user_id: string
        mana_earned: number | string
        mana_earned_breakdown: Record<string, unknown> | null
      }>(
        `select user_id, mana_earned, mana_earned_breakdown
         from leagues
         where season = $1
           and user_id = any($2::text[])`,
        [season, DRILL_USERS]
      )
      return Object.fromEntries(
        rows.map((row) => [
          row.user_id,
          {
            manaEarned: Number(row.mana_earned),
            breakdown: row.mana_earned_breakdown ?? {},
          },
        ])
      )
    }

    let leagueBefore: LeagueSnapshot = {}
    try {
      const enrolledUserIds = new Set(leagueRows.map((row) => row.user_id))
      for (const userId of DRILL_USERS) {
        if (enrolledUserIds.has(userId)) continue
        const inserted = await pg.one<{ id: string }>(
          `insert into leagues (user_id, season, division, cohort)
           values ($1, $2, 3, 'perp-dev-drill')
           returning id`,
          [userId, season]
        )
        temporaryLeagueRows.push({ id: inserted.id, userId })
        log(
          `temporarily enrolled ${userId} in season ${season} for the league exclusion drill`
        )
      }

      log('=== 0. establish league baseline ===')
      await updateLeague(season)
      leagueBefore = await snapshotLeague()
      check(
        Object.keys(leagueBefore).length > 0,
        'league: at least one drill trader has a baseline row'
      )
      for (const [userId, row] of Object.entries(leagueBefore))
        check(
          !Object.prototype.hasOwnProperty.call(row.breakdown, 'perp_profit'),
          `league: baseline ${userId} has no perp_profit entry`
        )

      log('=== A. open / retry / add / funding / flip / close / capacity ===')
      const workflow = await makeMarket('workflow', {
        subsidyLong: 500,
        subsidyShort: 500,
      })
      metricTargets.push({ userId: GENZY, contractId: workflow.id })

      const balanceA0 = await loadBalance(GENZY)
      const poolsA0 = await loadPools(workflow.id)
      const openKey = idempotencyKey()
      const opened = await openOrAddPosition(
        workflow.id,
        GENZY,
        'long',
        100,
        2,
        openKey
      )
      const balanceAfterOpen = await loadBalance(GENZY)
      const poolsAfterOpen = await loadPools(workflow.id)
      checkApprox(
        balanceAfterOpen,
        balanceA0 - 100,
        'A: open debits margin once'
      )
      checkApprox(
        poolsAfterOpen.L,
        poolsA0.L + 100,
        'A: open credits long pool'
      )

      const retriedOpen = await openOrAddPosition(
        workflow.id,
        GENZY,
        'long',
        100,
        2,
        openKey
      )
      checkApprox(
        retriedOpen.position.size,
        opened.position.size,
        'A: duplicate open returns stored position'
      )
      checkApprox(
        await loadBalance(GENZY),
        balanceAfterOpen,
        'A: duplicate open does not debit again'
      )
      const openEvents = await pg.one<{ count: string }>(
        `select count(*) as count
         from contract_perp_events
         where contract_id = $1
           and user_id = $2
           and data->>'idempotencyKey' = $3`,
        [workflow.id, GENZY, openKey]
      )
      check(
        Number(openEvents.count) === 1,
        'A: duplicate open writes one event'
      )
      await expectApiError(
        'A: reused trade key with different payload is rejected',
        () => openOrAddPosition(workflow.id, GENZY, 'long', 101, 2, openKey),
        409,
        'different trade'
      )

      const addKey = idempotencyKey()
      const added = await openOrAddPosition(
        workflow.id,
        GENZY,
        'long',
        50,
        3,
        addKey
      )
      checkApprox(added.position.costBasis, 150, 'A: add merges cost basis')
      check(added.event.eventType === 'add', 'A: add event is typed as add')

      // Age only this disposable contract so the first real funding period is
      // eligible without waiting an hour.
      const fundingNow = Date.now()
      await pg.none(
        `update contracts
         set data = data || $2::jsonb
         where id = $1
           and resolution_time is null`,
        [
          workflow.id,
          JSON.stringify({ createdTime: fundingNow - HOUR_MS - 1_000 }),
        ]
      )
      const lastBetBeforeFunding = await loadLastBetTime(workflow.id)
      const funding = await runFunding(workflow.id, fundingNow)
      check(funding !== null, 'A: first eligible funding period applies')
      check(
        funding !== null && funding.fundingEvent.fundingRate > 0,
        'A: imbalanced long pool pays positive funding'
      )
      check(
        (await runFunding(workflow.id, fundingNow)) === null,
        'A: duplicate funding run is a no-op'
      )
      check(
        (await loadLastBetTime(workflow.id)) === lastBetBeforeFunding,
        'A: funding does not change lastBetTime'
      )
      const fundingRows = await pg.one<{ count: string }>(
        `select count(*) as count
         from contract_perp_funding_events
         where contract_id = $1`,
        [workflow.id]
      )
      check(Number(fundingRows.count) === 1, 'A: one funding row persisted')

      const flipKey = idempotencyKey()
      const flipped = await openOrAddPosition(
        workflow.id,
        GENZY,
        'short',
        60,
        2,
        flipKey
      )
      check(flipped.position.direction === 'short', 'A: flip opens short')
      const sidesAfterFlip = await pg.manyOrNone<{ direction: string }>(
        `select direction
         from contract_perp_positions
         where contract_id = $1
           and user_id = $2`,
        [workflow.id, GENZY]
      )
      check(
        sidesAfterFlip.length === 1 && sidesAfterFlip[0].direction === 'short',
        'A: flip atomically removes the long'
      )
      const flipClose = await pg.oneOrNone<{
        reason: string | null
      }>(
        `select data->>'reason' as reason
         from contract_perp_events
         where contract_id = $1
           and user_id = $2
           and event_type = 'close'
         order by id desc
         limit 1`,
        [workflow.id, GENZY]
      )
      check(flipClose?.reason === 'flip', 'A: flip records its close leg')

      const closeKey = idempotencyKey()
      const closed = await closePosition(
        workflow.id,
        GENZY,
        'short',
        closeKey,
        flipped.position.openedTime
      )
      const balanceAfterClose = await loadBalance(GENZY)
      const retriedClose = await closePosition(
        workflow.id,
        GENZY,
        'short',
        closeKey,
        flipped.position.openedTime
      )
      checkApprox(
        retriedClose.payout,
        closed.payout,
        'A: duplicate close returns stored payout'
      )
      checkApprox(
        await loadBalance(GENZY),
        balanceAfterClose,
        'A: duplicate close does not pay again'
      )
      await expectApiError(
        'A: reused close key with different payload is rejected',
        () =>
          closePosition(
            workflow.id,
            GENZY,
            'long',
            closeKey,
            flipped.position.openedTime
          ),
        409,
        'different close'
      )
      const remainingA = await pg.one<{ count: string }>(
        `select count(*) as count
         from contract_perp_positions
         where contract_id = $1
           and user_id = $2`,
        [workflow.id, GENZY]
      )
      check(Number(remainingA.count) === 0, 'A: full close removes position')

      const capacityBalance = await loadBalance(GENZY)
      const capacityPools = await loadPools(workflow.id)
      await expectApiError(
        'A: insufficient open-interest capacity is rejected',
        () =>
          openOrAddPosition(
            workflow.id,
            GENZY,
            'long',
            100,
            100,
            idempotencyKey()
          ),
        400,
        'supports at most'
      )
      checkApprox(
        await loadBalance(GENZY),
        capacityBalance,
        'A: capacity rejection leaves balance unchanged'
      )
      const capacityPoolsAfter = await loadPools(workflow.id)
      checkApprox(
        capacityPoolsAfter.L,
        capacityPools.L,
        'A: capacity rejection leaves long pool unchanged'
      )
      checkApprox(
        capacityPoolsAfter.S,
        capacityPools.S,
        'A: capacity rejection leaves short pool unchanged'
      )
      await assertEscrow(
        workflow.id,
        'A: workflow escrow after full round trip'
      )

      log('=== B. forced liquidation + notification ===')
      const liquidation = await makeMarket('liquidation', {
        subsidyLong: 500,
        subsidyShort: 500,
      })
      metricTargets.push({ userId: GENZY, contractId: liquidation.id })
      await openOrAddPosition(
        liquidation.id,
        GENZY,
        'long',
        100,
        50,
        idempotencyKey()
      )
      const positionB = await pg.one<{
        size: number | string
        liquidation_price: number | string
      }>(
        `select size, liquidation_price
         from contract_perp_positions
         where contract_id = $1
           and user_id = $2`,
        [liquidation.id, GENZY]
      )
      checkApprox(Number(positionB.size), 5_000, 'B: 50x long opens')
      checkApprox(
        Number(positionB.liquidation_price),
        98,
        'B: liquidation price is 98'
      )
      const poolsBeforeLiquidation = await loadPools(liquidation.id)
      const lastBetBeforeLiquidation = await loadLastBetTime(liquidation.id)
      const liquidationResult = await publishAndApply(liquidation, 97.5)
      check(
        liquidationResult?.liquidated.length === 1 &&
          liquidationResult.liquidated[0].userId === GENZY,
        'B: one correct position liquidated'
      )
      check(
        (await loadLastBetTime(liquidation.id)) === lastBetBeforeLiquidation,
        'B: liquidation does not change lastBetTime'
      )
      const poolsAfterLiquidation = await loadPools(liquidation.id)
      checkApprox(
        poolsAfterLiquidation.L,
        poolsBeforeLiquidation.L,
        'B: forfeited margin stays in long pool'
      )
      checkApprox(
        poolsAfterLiquidation.S,
        poolsBeforeLiquidation.S,
        'B: liquidation leaves short pool unchanged'
      )
      const remainingB = await pg.one<{ count: string }>(
        `select count(*) as count
         from contract_perp_positions
         where contract_id = $1
           and user_id = $2`,
        [liquidation.id, GENZY]
      )
      check(Number(remainingB.count) === 0, 'B: liquidated position is removed')
      if (liquidationResult) {
        const { contract } = await loadContract(liquidation.id)
        await notifyPerpOracleResult(pg, contract, 97.5, liquidationResult)
      }
      const liquidationNotification = await pg.oneOrNone<{ text: string }>(
        `select data->>'sourceText' as text
         from user_notifications
         where user_id = $1
           and data->>'reason' = 'perp_liquidation'
           and data->>'sourceContractId' = $2
         order by (data->>'createdTime')::bigint desc
         limit 1`,
        [GENZY, liquidation.id]
      )
      check(
        liquidationNotification?.text.includes('100') === true &&
          liquidationNotification.text.toLowerCase().includes('liquidat'),
        'B: liquidation notification includes lost margin',
        liquidationNotification?.text ?? 'no browser notification row'
      )
      await assertEscrow(liquidation.id, 'B: liquidation escrow')

      log('=== C. forced ADL, notification, and settlement ===')
      const adl = await makeMarket('adl-and-resolution', {
        subsidyLong: 1_000,
        subsidyShort: 1_000,
      })
      metricTargets.push(
        { userId: GENZY, contractId: adl.id },
        { userId: DEVZY, contractId: adl.id }
      )
      await openOrAddPosition(adl.id, GENZY, 'long', 500, 20, idempotencyKey())
      await openOrAddPosition(adl.id, DEVZY, 'short', 100, 2, idempotencyKey())
      const lastBetBeforeAdl = await loadLastBetTime(adl.id)
      const adlResult = await publishAndApply(adl, 130)
      check(
        adlResult !== null &&
          adlResult.adlFactorLong > 0 &&
          adlResult.adlFactorLong < 0.5,
        'C: profitable long is materially auto-deleveraged',
        `factor=${adlResult?.adlFactorLong}`
      )
      check(
        adlResult?.adlAdjusted.length === 1 &&
          adlResult.adlAdjusted[0].position.userId === GENZY,
        'C: only the profitable long is scaled'
      )
      const positionC = await pg.one<{
        cost_basis: number | string
        size: number | string
      }>(
        `select cost_basis, size
         from contract_perp_positions
         where contract_id = $1
           and user_id = $2`,
        [adl.id, GENZY]
      )
      checkApprox(
        Number(positionC.cost_basis),
        500,
        'C: ADL preserves cost basis'
      )
      check(
        Number(positionC.size) < 10_000,
        'C: ADL reduces profitable notional'
      )
      check(
        (await loadLastBetTime(adl.id)) === lastBetBeforeAdl,
        'C: ADL does not change lastBetTime'
      )
      if (adlResult) {
        const { contract } = await loadContract(adl.id)
        await notifyPerpOracleResult(pg, contract, 130, adlResult)
      }
      const adlNotification = await pg.oneOrNone<{ text: string }>(
        `select data->>'sourceText' as text
         from user_notifications
         where user_id = $1
           and data->>'reason' = 'perp_adl'
           and data->>'sourceContractId' = $2
         order by (data->>'createdTime')::bigint desc
         limit 1`,
        [GENZY, adl.id]
      )
      check(
        adlNotification?.text.includes('->') === true &&
          adlNotification.text.includes('reduced'),
        'C: ADL notification explains before/after reduction',
        adlNotification?.text ?? 'no browser notification row'
      )
      const unscaledNotification = await pg.oneOrNone(
        `select 1
         from user_notifications
         where user_id = $1
           and data->>'reason' = 'perp_adl'
           and data->>'sourceContractId' = $2`,
        [DEVZY, adl.id]
      )
      check(!unscaledNotification, 'C: unscaled short receives no ADL notice')
      await assertEscrow(adl.id, 'C: ADL escrow')

      const lastBetBeforeResolution = await loadLastBetTime(adl.id)
      const escrowBeforeResolution = await loadEscrowBalance(adl.id)
      const resolutionBalancesBefore = new Map(
        await Promise.all(
          [DEV_MANIFOLD, ...DRILL_USERS].map(
            async (userId) => [userId, await loadBalance(userId)] as const
          )
        )
      )
      const resolutionResponse = await resolveMarketMain(
        { contractId: adl.id, outcome: 'MKT' },
        scriptAuth,
        scriptRequest
      )
      if (
        !resolutionResponse ||
        !('result' in resolutionResponse) ||
        !('continue' in resolutionResponse)
      )
        throw new Error('C: resolve-market returned no continuation')
      await resolutionResponse.continue()

      const resolvedAdl = await loadContract(adl.id)
      check(
        resolvedAdl.resolutionTime !== null &&
          resolvedAdl.contract.isResolved &&
          resolvedAdl.contract.resolvedOraclePrice === 130,
        'C: resolve-market persists final oracle 130'
      )
      check(
        (await loadLastBetTime(adl.id)) === lastBetBeforeResolution,
        'C: settlement does not change lastBetTime'
      )
      const positionsAfterResolution = await pg.one<{ count: string }>(
        `select count(*) as count
         from contract_perp_positions
         where contract_id = $1`,
        [adl.id]
      )
      check(
        Number(positionsAfterResolution.count) === 0,
        'C: settlement removes all positions'
      )
      const resolutionEvents = await pg.manyOrNone<{
        user_id: string
        original_cost_basis: number | string
        payout: number | string
        pnl: number | string
      }>(
        `select
           user_id,
           (data->>'originalCostBasis')::numeric as original_cost_basis,
           (data->>'payout')::numeric as payout,
           (data->>'pnl')::numeric as pnl
         from contract_perp_events
         where contract_id = $1
           and user_id = any($2::text[])
           and event_type = 'close'
           and data->>'reason' = 'resolve-market'`,
        [adl.id, DRILL_USERS]
      )
      check(
        resolutionEvents.length === DRILL_USERS.length,
        'C: settlement records one resolve-market close per holder'
      )
      const residualTxns = await pg.manyOrNone<{
        amount: number | string
      }>(
        `select amount
         from txns
         where category = 'PERP_RESOLVE_RESIDUAL'
           and from_id = $1
           and to_id = $2
         order by created_time`,
        [adl.id, DEV_MANIFOLD]
      )
      check(
        residualTxns.length === 1,
        'C: settlement writes exactly one creator residual transaction',
        `count=${residualTxns.length}`
      )
      const residualAmount = Number(residualTxns[0]?.amount)
      check(
        Number.isFinite(residualAmount) && residualAmount >= 0,
        'C: creator residual is finite and non-negative',
        `amount=${residualAmount}`
      )
      const resolutionNotifications = await pg.manyOrNone<{
        user_id: string
        reason: string
        user_investment: number | string
        user_payout: number | string
        profit: number | string
      }>(
        `select
           user_id,
           data->>'reason' as reason,
           (data->'data'->>'userInvestment')::numeric as user_investment,
           (data->'data'->>'userPayout')::numeric as user_payout,
           (data->'data'->>'profit')::numeric as profit
         from user_notifications
         where user_id = any($1::text[])
           and data->>'sourceContractId' = $2
           and data->>'sourceUpdateType' = 'resolved'
           and data->>'reason' =
             'resolutions_on_watched_markets_with_shares_in'`,
        [DRILL_USERS, adl.id]
      )
      let holderPayoutTotal = 0
      for (const holderId of DRILL_USERS) {
        const event = resolutionEvents.find((row) => row.user_id === holderId)
        const expectedInvestment = Number(event?.original_cost_basis)
        const expectedPayout = Number(event?.payout)
        const expectedProfit = Number(event?.pnl)
        holderPayoutTotal += expectedPayout

        const payoutTxn = await pg.one<{
          count: string
          amount: number | string
        }>(
          `select count(*) as count, coalesce(sum(amount), 0) as amount
           from txns
           where category = 'PERP_CLOSE_PAYOUT'
             and from_id = $1
             and to_id = $2`,
          [adl.id, holderId]
        )
        check(
          Number(payoutTxn.count) === (expectedPayout > 0 ? 1 : 0),
          `C: ${holderId} has the expected payout transaction count`,
          `count=${payoutTxn.count}, payout=${expectedPayout}`
        )
        checkApprox(
          Number(payoutTxn.amount),
          expectedPayout,
          `C: ${holderId} payout transaction matches close event`
        )
        checkApprox(
          (await loadBalance(holderId)) -
            Number(resolutionBalancesBefore.get(holderId)),
          expectedPayout,
          `C: ${holderId} balance delta matches settlement payout`
        )

        const notification = resolutionNotifications.find(
          (row) => row.user_id === holderId
        )
        check(
          notification?.reason ===
            'resolutions_on_watched_markets_with_shares_in',
          `C: resolve continuation sends the holder-specific reason to ${holderId}`
        )
        checkApprox(
          Number(notification?.user_investment),
          expectedInvestment,
          `C: ${holderId} notification investment matches settled position`
        )
        checkApprox(
          Number(notification?.user_payout),
          expectedPayout,
          `C: ${holderId} notification payout matches settled position`
        )
        checkApprox(
          Number(notification?.profit),
          expectedProfit,
          `C: ${holderId} notification profit matches settled position`
        )
      }
      checkApprox(
        (await loadBalance(DEV_MANIFOLD)) -
          Number(resolutionBalancesBefore.get(DEV_MANIFOLD)),
        residualAmount,
        'C: creator balance delta matches the residual transaction'
      )
      checkApprox(
        holderPayoutTotal + residualAmount,
        escrowBeforeResolution,
        'C: holder payouts plus creator residual reconcile to pre-resolution escrow',
        1e-6
      )
      await assertEscrow(adl.id, 'C: resolved market ledger and pools are zero')
      await expectApiError(
        'C: second resolve-market request is rejected',
        () =>
          resolveMarketMain(
            { contractId: adl.id, outcome: 'MKT' },
            scriptAuth,
            scriptRequest
          ),
        403,
        'already resolved'
      )
      await expectApiError(
        'C: trading after settlement is rejected',
        () => openOrAddPosition(adl.id, DEVZY, 'long', 10, 2, idempotencyKey()),
        400,
        'resolved'
      )

      log('=== C2. resolution-time liquidation and holder reporting ===')
      const resolutionLiquidation = await makeMarket('resolution-liquidation', {
        subsidyLong: 500,
        subsidyShort: 500,
      })
      metricTargets.push({
        userId: GENZY,
        contractId: resolutionLiquidation.id,
      })
      await openOrAddPosition(
        resolutionLiquidation.id,
        GENZY,
        'long',
        100,
        50,
        idempotencyKey()
      )
      const resolutionLiqEscrowBefore = await loadEscrowBalance(
        resolutionLiquidation.id
      )
      const resolutionLiqHolderBalanceBefore = await loadBalance(GENZY)
      const resolutionLiqCreatorBalanceBefore = await loadBalance(DEV_MANIFOLD)
      const resolutionLiqLastBetTime = await loadLastBetTime(
        resolutionLiquidation.id
      )
      await publishWithoutApplying(resolutionLiquidation, 97.5)
      assertSchedulerIsolationWindow('resolving final-price liquidation market')
      const resolutionLiqResponse = await resolveMarketMain(
        { contractId: resolutionLiquidation.id, outcome: 'MKT' },
        scriptAuth,
        scriptRequest
      )
      if (
        !resolutionLiqResponse ||
        !('result' in resolutionLiqResponse) ||
        !('continue' in resolutionLiqResponse)
      )
        throw new Error('C2: resolve-market returned no continuation')
      await resolutionLiqResponse.continue()

      const resolvedLiquidation = await loadContract(resolutionLiquidation.id)
      check(
        resolvedLiquidation.resolutionTime !== null &&
          resolvedLiquidation.contract.isResolved &&
          resolvedLiquidation.contract.resolvedOraclePrice === 97.5,
        'C2: resolution selects the unapplied final oracle point'
      )
      check(
        (await loadLastBetTime(resolutionLiquidation.id)) ===
          resolutionLiqLastBetTime,
        'C2: resolution-time liquidation does not change lastBetTime'
      )
      const finalLiquidationEvent = await pg.oneOrNone<{
        original_cost_basis: number | string
        payout: number | string
      }>(
        `select
           (data->>'originalCostBasis')::numeric as original_cost_basis,
           (data->>'payout')::numeric as payout
         from contract_perp_events
         where contract_id = $1
           and user_id = $2
           and event_type = 'liquidation'
         order by id desc
         limit 1`,
        [resolutionLiquidation.id, GENZY]
      )
      checkApprox(
        Number(finalLiquidationEvent?.original_cost_basis),
        100,
        'C2: final-price liquidation records the full lost margin'
      )
      checkApprox(
        Number(finalLiquidationEvent?.payout),
        0,
        'C2: final-price liquidation records zero payout'
      )
      const finalLiquidationClosePayout = await pg.one<{
        count: string
        amount: number | string
      }>(
        `select count(*) as count, coalesce(sum(amount), 0) as amount
         from txns
         where category = 'PERP_CLOSE_PAYOUT'
           and from_id = $1
           and to_id = $2`,
        [resolutionLiquidation.id, GENZY]
      )
      check(
        Number(finalLiquidationClosePayout.count) === 0 &&
          Number(finalLiquidationClosePayout.amount) === 0,
        'C2: liquidated holder receives no close payout transaction'
      )
      checkApprox(
        (await loadBalance(GENZY)) - resolutionLiqHolderBalanceBefore,
        0,
        'C2: liquidated holder balance receives no settlement payout'
      )
      const resolutionLiqResiduals = await pg.manyOrNone<{
        amount: number | string
      }>(
        `select amount
         from txns
         where category = 'PERP_RESOLVE_RESIDUAL'
           and from_id = $1
           and to_id = $2`,
        [resolutionLiquidation.id, DEV_MANIFOLD]
      )
      check(
        resolutionLiqResiduals.length === 1,
        'C2: final-price liquidation writes exactly one creator residual'
      )
      const resolutionLiqResidual = Number(resolutionLiqResiduals[0]?.amount)
      checkApprox(
        resolutionLiqResidual,
        resolutionLiqEscrowBefore,
        'C2: creator residual consumes all pre-resolution escrow'
      )
      checkApprox(
        (await loadBalance(DEV_MANIFOLD)) - resolutionLiqCreatorBalanceBefore,
        resolutionLiqResidual,
        'C2: creator balance delta matches final-price liquidation residual'
      )
      const finalLiquidationNotice = await pg.oneOrNone<{
        text: string
      }>(
        `select data->>'sourceText' as text
         from user_notifications
         where user_id = $1
           and data->>'reason' = 'perp_liquidation'
           and data->>'sourceContractId' = $2
         order by (data->>'createdTime')::bigint desc
         limit 1`,
        [GENZY, resolutionLiquidation.id]
      )
      check(
        finalLiquidationNotice?.text.includes('100') === true &&
          finalLiquidationNotice.text.toLowerCase().includes('liquidat'),
        'C2: resolution continuation emits the liquidation notification',
        finalLiquidationNotice?.text ?? 'no browser notification row'
      )
      const finalHolderNotice = await pg.oneOrNone<{
        reason: string
        user_investment: number | string
        user_payout: number | string
        profit: number | string
      }>(
        `select
           data->>'reason' as reason,
           (data->'data'->>'userInvestment')::numeric as user_investment,
           (data->'data'->>'userPayout')::numeric as user_payout,
           (data->'data'->>'profit')::numeric as profit
         from user_notifications
         where user_id = $1
           and data->>'sourceContractId' = $2
           and data->>'sourceUpdateType' = 'resolved'
           and data->>'reason' =
             'resolutions_on_watched_markets_with_shares_in'
         order by (data->>'createdTime')::bigint desc
         limit 1`,
        [GENZY, resolutionLiquidation.id]
      )
      check(
        finalHolderNotice?.reason ===
          'resolutions_on_watched_markets_with_shares_in',
        'C2: liquidated trader receives the holder-specific resolution notice'
      )
      checkApprox(
        Number(finalHolderNotice?.user_investment),
        100,
        'C2: liquidated holder notification reports full investment'
      )
      checkApprox(
        Number(finalHolderNotice?.user_payout),
        0,
        'C2: liquidated holder notification reports zero payout'
      )
      checkApprox(
        Number(finalHolderNotice?.profit),
        -100,
        'C2: liquidated holder notification reports the full loss'
      )
      await assertEscrow(
        resolutionLiquidation.id,
        'C2: resolved liquidation market ledger and pools are zero'
      )

      log('=== D. stale feed blocks both open and close ===')
      const stale = await makeMarket('stale-gate', {
        subsidyLong: 500,
        subsidyShort: 500,
        maxOraclePriceAgeMs: 15_000,
      })
      metricTargets.push({ userId: DEVZY, contractId: stale.id })
      await openOrAddPosition(stale.id, DEVZY, 'long', 100, 5, idempotencyKey())
      await pg.none(
        `update contracts
         set data = data || $2::jsonb
         where id = $1
           and resolution_time is null`,
        [stale.id, JSON.stringify({ oraclePriceTime: Date.now() - 15_001 })]
      )
      await expectApiError(
        'D: stale feed blocks an open',
        () =>
          openOrAddPosition(stale.id, GENZY, 'long', 100, 5, idempotencyKey()),
        400,
        'stale'
      )
      await expectApiError(
        'D: stale feed blocks a close',
        () => closePosition(stale.id, DEVZY, 'long', idempotencyKey()),
        400,
        'stale'
      )
      await publishAndApply(stale, 100)
      await closePosition(stale.id, DEVZY, 'long', idempotencyKey())
      check(
        Number(
          (
            await pg.one<{ count: string }>(
              `select count(*) as count
               from contract_perp_positions
               where contract_id = $1`,
              [stale.id]
            )
          ).count
        ) === 0,
        'D: a fresh point restores closing'
      )
      await assertEscrow(stale.id, 'D: stale-gate escrow after restored close')

      log('=== E. day/week/month accounting reconciliation ===')
      const calculated = await calculatePerpPeriodMetricUpdates({
        pg,
        targets: metricTargets,
      })
      const calculatedByTarget = new Map(
        calculated.map((metric) => [
          metricKey(metric.userId, metric.contractId),
          metric,
        ])
      )
      check(
        calculatedByTarget.size === metricTargets.length,
        'E: every drill user/market has a calculated period metric',
        `calculated=${calculatedByTarget.size}, expected=${metricTargets.length}`
      )

      await updateUserMetricPeriods(DRILL_USERS)
      for (const target of metricTargets) {
        const row = await pg.oneOrNone<{
          data: MetricData
          profit: number | string | null
        }>(
          `select data, profit
           from user_contract_metrics
           where user_id = $1
             and contract_id = $2
             and answer_id is null`,
          [target.userId, target.contractId]
        )
        if (!row) {
          check(
            false,
            `E: persisted metric ${target.userId}/${target.contractId}`,
            'row missing'
          )
          continue
        }
        const flows = await pg.one<{
          new_margin: number | string
          realized_payout: number | string
        }>(
          `select
             coalesce(sum(
               case
                 when event_type in ('open', 'add')
                   and original_cost_basis_delta > 0
                 then original_cost_basis_delta
                 else 0
               end
             ), 0) as new_margin,
             coalesce(sum(
               case
                 when event_type in ('close', 'liquidation', 'adl')
                 then coalesce((data->>'payout')::numeric, 0)
                 else 0
               end
             ), 0) as realized_payout
           from contract_perp_events
           where contract_id = $1
             and user_id = $2`,
          [target.contractId, target.userId]
        )
        // Every drill market was created inside all three rolling windows, so
        // its boundary account is empty:
        // P&L = current value + realized payouts - new margin.
        const expectedProfit =
          Number(row.data.payout ?? 0) +
          Number(flows.realized_payout) -
          Number(flows.new_margin)
        const label = `${target.userId.slice(0, 6)}/${target.contractId}`
        checkApprox(
          Number(row.profit ?? row.data.profit ?? 0),
          expectedProfit,
          `E: ${label} lifetime metric reconciles`,
          1e-6
        )
        const calculatedMetric = calculatedByTarget.get(
          metricKey(target.userId, target.contractId)
        )
        for (const period of ['day', 'week', 'month'] as const) {
          const persisted = row.data.from?.[period]?.profit
          const computed = calculatedMetric?.from?.[period]?.profit
          checkApprox(
            Number(persisted),
            expectedProfit,
            `E: ${label} ${period} P&L reconciles`,
            1e-6
          )
          checkApprox(
            Number(persisted),
            Number(computed),
            `E: ${label} ${period} job persisted snapshot result`,
            1e-6
          )
        }
      }

      log('=== F. league exclusion ===')
      await updateLeague(season)
      const leagueAfter = await snapshotLeague()
      for (const [userId, before] of Object.entries(leagueBefore)) {
        const after = leagueAfter[userId]
        check(!!after, `F: league row remains for ${userId}`)
        if (!after) continue
        checkApprox(
          after.manaEarned,
          before.manaEarned,
          `F: PERP activity does not change mana_earned for ${userId}`
        )
        check(
          !Object.prototype.hasOwnProperty.call(after.breakdown, 'perp_profit'),
          `F: ${userId} has no perp_profit breakdown entry`
        )
      }
    } finally {
      log('=== cleanup: resolve every market created by this run ===')
      for (const market of [...createdMarkets].reverse()) {
        let cleaned = false
        let lastError: unknown
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const loaded = await loadContract(market.id)
            if (loaded.resolutionTime === null && !loaded.contract.isResolved) {
              const result = await resolvePerp(market.id, DEV_MANIFOLD)
              log(
                `resolved ${market.id} at ${
                  result.finalPrice
                }; residual M$${result.residualPayout.toFixed(2)}`
              )
            } else {
              log(`${market.id} was already resolved`)
            }
            await assertEscrow(market.id, `cleanup: ${market.id} escrow`)
            cleaned = true
            break
          } catch (error) {
            lastError = error
            if (attempt < 3) {
              log.warn(
                `cleanup attempt ${attempt}/3 failed for ${
                  market.id
                }; retrying: ${
                  error instanceof Error ? error.message : String(error)
                }`
              )
              await new Promise((resolve) => setTimeout(resolve, attempt * 500))
            }
          }
        }
        if (!cleaned) {
          failures++
          log.error(
            `FAILED TO CLEAN UP ${market.id}: ${
              lastError instanceof Error ? lastError.message : String(lastError)
            }`
          )
        }
      }
      for (const temporary of temporaryLeagueRows) {
        try {
          const deleted = await pg.result(
            `delete from leagues
             where id = $1
               and user_id = $2
               and season = $3
               and cohort = 'perp-dev-drill'`,
            [temporary.id, temporary.userId, season]
          )
          if (deleted.rowCount === 1) {
            log(
              `removed temporary league enrollment ${temporary.id} for ${temporary.userId}`
            )
          } else {
            failures++
            log.error(
              `FAILED TO REMOVE TEMP LEAGUE ROW ${temporary.id}: deleted ${deleted.rowCount} rows, expected 1`
            )
          }
        } catch (error) {
          failures++
          log.error(
            `FAILED TO REMOVE TEMP LEAGUE ROW ${temporary.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      }
    }

    log(`==== DRILL COMPLETE: ${passes} passed, ${failures} failed ====`)
    if (failures > 0) process.exitCode = 1
  })
