import { PerpContract } from 'common/contract'
import {
  assertPerpFundingConfig,
  getPerpOpenInterestCapacity,
  assertPerpStateSolvent,
} from 'common/perps/amm'
import { isPerpEscrowBalanced } from 'common/perps/escrow'
import { shouldApplyFunding } from 'common/perps/funding'
import { getOracleFreshness } from 'common/perps/oracle'
import { PerpPosition } from 'common/perps/position'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'

import {
  PERP_LAUNCH_EXCLUDED_FEED_IDS,
  PERP_LAUNCH_MARKETS,
  PERP_LAUNCH_SCHEDULER_EXPECTATIONS,
  getNominalAnnualFundingRate,
  getPerpLaunchCreatorId,
  getPerpLaunchManifestErrors,
  getPerpLaunchTopicSlug,
} from 'shared/perps/launch-manifest'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { getLocalEnv } from 'shared/init-admin'
import { log } from 'shared/utils'
import { runScript } from './run-script'

type Phase = 'feeds' | 'unlisted' | 'public'
type Level = 'PASS' | 'WARN' | 'FAIL'

type FeedSnapshot = {
  feedId: string
  latestTs: number
  latestPrice: number
  sourceTs?: number
  oldestTs: number
  pointCount: number
}

type StoredPositionRow = {
  contract_id: string
  user_id: string
  direction: string
  size: number | string
  cost_basis: number | string
  original_cost_basis: number | string
  entry_price: number | string
  leverage: number | string
  liquidation_price: number | string
  opened_time: string
  updated_time: string
}

const phaseArg = process.argv.find((arg) => arg.startsWith('--phase='))
const phaseValue = phaseArg?.slice('--phase='.length) ?? 'feeds'
if (
  phaseValue !== 'feeds' &&
  phaseValue !== 'unlisted' &&
  phaseValue !== 'public'
)
  throw new Error(
    `Invalid --phase=${phaseValue}; expected feeds, unlisted, or public`
  )
const phase: Phase = phaseValue
const acknowledgesLatencyRisk = process.argv.includes(
  '--acknowledge-latency-risk'
)

if (require.main === module)
  runScript(async ({ pg }) => {
    const environment = getLocalEnv()
    let failures = 0
    let warnings = 0
    const report = (level: Level, name: string, detail: string) => {
      const message = `[${level}] ${name}: ${detail}`
      if (level === 'FAIL') {
        failures++
        log.error(message)
      } else if (level === 'WARN') {
        warnings++
        log.warn(message)
      } else {
        log(message)
      }
    }
    const inspect = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (error) {
        report(
          'FAIL',
          name,
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    log(`PERP launch preflight: environment=${environment}, phase=${phase}`)

    const manifestErrors = getPerpLaunchManifestErrors()
    if (manifestErrors.length === 0)
      report('PASS', 'launch manifest', 'registry and ECI exclusion agree')
    else
      manifestErrors.forEach((error) =>
        report('FAIL', 'launch manifest', error)
      )

    const schemaChecks = [
      ['table oracle_prices', 'public.oracle_prices'],
      ['table contract_perp_positions', 'public.contract_perp_positions'],
      ['table contract_perp_events', 'public.contract_perp_events'],
      [
        'table contract_perp_funding_events',
        'public.contract_perp_funding_events',
      ],
      ['index oracle history', 'public.oracle_prices_feed_ts_desc'],
      [
        'index oracle publication history',
        'public.oracle_prices_feed_published',
      ],
      ['index one-way positions', 'public.contract_perp_positions_one_way'],
      [
        'index participation events',
        'public.contract_perp_events_participation_ts',
      ],
      [
        'index open idempotency',
        'public.contract_perp_events_open_idempotency',
      ],
      [
        'index close idempotency',
        'public.contract_perp_events_close_idempotency',
      ],
      [
        'index PERP accounting history',
        'public.contract_perp_events_user_contract_applied',
      ],
      [
        'index recent PERP accounting activity',
        'public.contract_perp_events_recent_applied',
      ],
      [
        'index PERP lifetime accounting',
        'public.contract_perp_events_user_contract_lifetime',
      ],
    ] as const
    await inspect('database schema', async () => {
      for (const [label, relation] of schemaChecks) {
        const row = await pg.one<{ present: boolean }>(
          `select to_regclass($1) is not null as present`,
          [relation]
        )
        report(
          row.present ? 'PASS' : 'FAIL',
          label,
          row.present ? relation : `${relation} is missing`
        )
      }
      const sourceTimestampColumn = await pg.one<{ present: boolean }>(
        `select exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'oracle_prices'
             and column_name = 'source_ts'
         ) as present`
      )
      report(
        sourceTimestampColumn.present ? 'PASS' : 'FAIL',
        'oracle source timestamp column',
        sourceTimestampColumn.present
          ? 'public.oracle_prices.source_ts is installed'
          : 'oracle source timestamp migration is missing'
      )
      const accountingColumns = await pg.one<{
        applied_ts: boolean
        published_at: boolean
      }>(
        `select
           exists (
             select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'contract_perp_events'
               and column_name = 'applied_ts'
           ) as applied_ts,
           exists (
             select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'oracle_prices'
               and column_name = 'published_at'
           ) as published_at`
      )
      report(
        accountingColumns.applied_ts ? 'PASS' : 'FAIL',
        'PERP event application timestamp',
        accountingColumns.applied_ts
          ? 'public.contract_perp_events.applied_ts is installed'
          : 'PERP accounting history migration is missing'
      )
      report(
        accountingColumns.published_at ? 'PASS' : 'FAIL',
        'oracle publication timestamp',
        accountingColumns.published_at
          ? 'public.oracle_prices.published_at is installed'
          : 'PERP accounting history migration is missing'
      )
      const trigger = await pg.one<{ present: boolean }>(
        `select exists (
           select 1
           from pg_trigger t
           where t.tgname = 'oracle_prices_no_update'
             and not t.tgisinternal
             and pg_get_functiondef(t.tgfoid) like '%source_ts%'
             and pg_get_functiondef(t.tgfoid) like '%published_at%'
             and pg_get_triggerdef(t.oid) like '%DELETE%'
         ) as present`
      )
      report(
        trigger.present ? 'PASS' : 'FAIL',
        'immutable oracle trigger',
        trigger.present
          ? 'oracle_prices_no_update protects price, source, and publication metadata'
          : 'append-only oracle accounting migration is missing'
      )
      const eventTrigger = await pg.one<{ present: boolean }>(
        `select exists (
           select 1
           from pg_trigger t
           where t.tgname = 'contract_perp_events_immutable'
             and not t.tgisinternal
             and pg_get_triggerdef(t.oid) like '%UPDATE%'
             and pg_get_triggerdef(t.oid) like '%DELETE%'
         ) as present`
      )
      report(
        eventTrigger.present ? 'PASS' : 'FAIL',
        'immutable PERP event trigger',
        eventTrigger.present
          ? 'contract_perp_events rejects updates and deletes'
          : 'append-only PERP accounting migration is missing'
      )
      const relatedPerps = await pg.one<{ present: boolean }>(
        `select coalesce(
           pg_get_functiondef(
             to_regprocedure(
               'public.close_contract_embeddings(text,double precision,integer)'
             )
           ) like '%contracts.mechanism = ''perp''%',
           false
         ) as present`
      )
      report(
        relatedPerps.present ? 'PASS' : 'FAIL',
        'related-market embeddings',
        relatedPerps.present
          ? 'active PERPs are eligible'
          : 'close_contract_embeddings PERP migration is missing'
      )
    })

    await inspect('launch discovery topics', async () => {
      for (const market of PERP_LAUNCH_MARKETS) {
        for (const topic of market.requiredTopics) {
          const requiredSlug = getPerpLaunchTopicSlug(topic, environment)
          const storedTopic = await pg.oneOrNone<{
            id: string
            name: string
            slug: string
          }>(
            `select id, name, slug
             from groups
             where slug = $1`,
            [requiredSlug]
          )
          report(
            storedTopic ? 'PASS' : 'FAIL',
            `topic ${topic.name}`,
            storedTopic
              ? `${storedTopic.slug} (${storedTopic.id})`
              : `${requiredSlug} is missing from groups`
          )
        }
      }
    })

    const feedSnapshots = new Map<string, FeedSnapshot>()
    await inspect('oracle feeds', async () => {
      const feedIds = PERP_LAUNCH_MARKETS.map((market) => market.feedId)
      const rows = await pg.manyOrNone<{
        feed_id: string
        latest_ts: string
        latest_price: number | string
        latest_source_ts: string | null
        oldest_ts: string
        point_count: number | string
      }>(
        `select distinct on (latest.feed_id)
           latest.feed_id,
           latest.ts as latest_ts,
           latest.price as latest_price,
           latest.source_ts as latest_source_ts,
           stats.oldest_ts,
           stats.point_count
         from oracle_prices latest
         join (
           select feed_id, min(ts) as oldest_ts, count(*) as point_count
           from oracle_prices
           where feed_id = any($1)
           group by feed_id
         ) stats on stats.feed_id = latest.feed_id
         where latest.feed_id = any($1)
         order by latest.feed_id, latest.ts desc`,
        [feedIds]
      )
      rows.forEach((row) => {
        feedSnapshots.set(row.feed_id, {
          feedId: row.feed_id,
          latestTs: new Date(row.latest_ts).getTime(),
          latestPrice: Number(row.latest_price),
          ...(row.latest_source_ts == null
            ? {}
            : { sourceTs: new Date(row.latest_source_ts).getTime() }),
          oldestTs: new Date(row.oldest_ts).getTime(),
          pointCount: Number(row.point_count),
        })
      })

      const now = Date.now()
      for (const market of PERP_LAUNCH_MARKETS) {
        const feed = getOracleFeed(market.feedId)
        const snapshot = feedSnapshots.get(market.feedId)
        if (!feed || !snapshot) {
          report(
            'FAIL',
            `feed ${market.feedId}`,
            !feed ? 'registry entry missing' : 'no published oracle history'
          )
          continue
        }
        const rejection = validateOraclePoint(feed, null, {
          ts: snapshot.latestTs,
          price: snapshot.latestPrice,
        })
        if (rejection) {
          report('FAIL', `feed ${market.feedId}`, rejection)
          continue
        }
        if (market.requiresSourceAsOf) {
          const sourceTimestampReady =
            snapshot.sourceTs != null &&
            Number.isFinite(snapshot.sourceTs) &&
            snapshot.sourceTs > 0
          report(
            sourceTimestampReady ? 'PASS' : 'FAIL',
            `feed ${market.feedId} source attribution`,
            sourceTimestampReady
              ? `provider data as of ${new Date(
                  snapshot.sourceTs as number
                ).toISOString()}`
              : 'latest point has no valid provider source timestamp'
          )
        }
        const freshness = getOracleFreshness(
          snapshot.latestTs,
          feed.staleAfterMs,
          now
        )
        report(
          freshness.status === 'fresh' ? 'PASS' : 'FAIL',
          `feed ${market.feedId} freshness`,
          freshness.ageMs == null
            ? 'age is invalid'
            : `age=${Math.round(freshness.ageMs / 1000)}s, limit=${Math.round(
                feed.staleAfterMs / 1000
              )}s`
        )
        const spanMs = snapshot.latestTs - snapshot.oldestTs
        const historyReady =
          Number.isFinite(spanMs) &&
          spanMs >= market.minimumHistory.spanMs &&
          snapshot.pointCount >= market.minimumHistory.points
        report(
          historyReady ? 'PASS' : 'FAIL',
          `feed ${market.feedId} chart history`,
          `${snapshot.pointCount} points across ${Math.max(
            0,
            Math.round(spanMs / HOUR_MS)
          )}h; require ${
            market.minimumHistory.points
          } points across ${Math.round(
            market.minimumHistory.spanMs / HOUR_MS
          )}h`
        )
      }
    })

    await inspect('scheduler heartbeats', async () => {
      const names = PERP_LAUNCH_SCHEDULER_EXPECTATIONS.map(
        (expected) => expected.jobName
      )
      const rows = await pg.manyOrNone<{
        job_name: string
        last_start_time: string | null
        last_end_time: string | null
      }>(
        `select job_name, last_start_time, last_end_time
         from scheduler_info where job_name = any($1)`,
        [names]
      )
      const byName = new Map(rows.map((row) => [row.job_name, row]))
      const now = Date.now()
      for (const expected of PERP_LAUNCH_SCHEDULER_EXPECTATIONS) {
        const row = byName.get(expected.jobName)
        if (!row?.last_end_time) {
          report(
            'FAIL',
            `scheduler ${expected.jobName}`,
            'no successful completion heartbeat'
          )
          continue
        }
        const lastEnd = new Date(row.last_end_time).getTime()
        const lastStart = row.last_start_time
          ? new Date(row.last_start_time).getTime()
          : 0
        const endAge = now - lastEnd
        const stillRunning = lastStart > lastEnd
        const stuck = stillRunning && now - lastStart > expected.maxRunMs
        const healthy =
          Number.isFinite(endAge) &&
          endAge >= 0 &&
          endAge <= expected.maxEndAgeMs &&
          !stuck
        report(
          healthy ? 'PASS' : 'FAIL',
          `scheduler ${expected.jobName}`,
          stuck
            ? `run has not completed for ${Math.round(
                (now - lastStart) / MINUTE_MS
              )}m`
            : `last success ${Math.round(endAge / MINUTE_MS)}m ago${
                stillRunning ? '; next run is active' : ''
              }`
        )
      }
    })

    await inspect('active PERP contracts', async () => {
      const rows = await pg.manyOrNone<{ data: PerpContract }>(
        `select data from contracts
         where mechanism = 'perp' and resolution_time is null`
      )
      const contracts = rows.map((row) => row.data)
      const launchIds = new Set(
        PERP_LAUNCH_MARKETS.map((market) => market.feedId)
      )
      const excludedIds = new Set<string>(PERP_LAUNCH_EXCLUDED_FEED_IDS)

      for (const contract of contracts) {
        const feed = getOracleFeed(contract.oracleFeedId)
        const definition = PERP_LAUNCH_MARKETS.find(
          (market) => market.feedId === contract.oracleFeedId
        )
        if (excludedIds.has(contract.oracleFeedId)) {
          report(
            'FAIL',
            `market ${contract.slug}`,
            `${contract.oracleFeedId} is explicitly excluded from launch`
          )
        } else if (!feed || !feed.marketCreationEnabled) {
          report(
            'FAIL',
            `market ${contract.slug}`,
            `feed ${contract.oracleFeedId} is unknown or creation-disabled`
          )
        } else if (!launchIds.has(contract.oracleFeedId)) {
          report(
            phase === 'public' ? 'FAIL' : 'WARN',
            `market ${contract.slug}`,
            `feed ${contract.oracleFeedId} is outside the launch manifest`
          )
        }

        if (definition) {
          const expectedCreatorId = getPerpLaunchCreatorId(environment)
          report(
            contract.question === definition.question ? 'PASS' : 'FAIL',
            `market ${contract.slug} launch title`,
            contract.question === definition.question
              ? definition.question
              : `stored="${contract.question}", expected="${definition.question}"; the Perpetual type is rendered separately`
          )
          report(
            contract.creatorId === expectedCreatorId ? 'PASS' : 'FAIL',
            `market ${contract.slug} launch creator`,
            contract.creatorId === expectedCreatorId
              ? `official ${environment} Manifold account`
              : `creator ${contract.creatorId} is not the required official account ${expectedCreatorId}; residual backing returns to the creator`
          )
          const discovery = await pg.one<{
            group_slugs: string[]
            has_embedding: boolean
          }>(
            `select
               array(
                 select g.slug
                 from group_contracts gc
                 join groups g on g.id = gc.group_id
                 where gc.contract_id = $1
               ) as group_slugs,
               exists(
                 select 1
                 from contract_embeddings
                 where contract_id = $1
               ) as has_embedding`,
            [contract.id]
          )
          const requiredTopics = definition.requiredTopics.map((topic) => ({
            ...topic,
            slug: getPerpLaunchTopicSlug(topic, environment),
          }))
          const missingTopicJoins = requiredTopics.filter(
            (topic) => !discovery.group_slugs.includes(topic.slug)
          )
          const cachedGroupSlugs = contract.groupSlugs ?? []
          const missingCachedTopicSlugs = requiredTopics.filter(
            (topic) => !cachedGroupSlugs.includes(topic.slug)
          )
          const topicStateErrors = [
            ...(missingTopicJoins.length > 0
              ? [
                  `group_contracts missing ${missingTopicJoins
                    .map((topic) => topic.name)
                    .join(', ')}`,
                ]
              : []),
            ...(missingCachedTopicSlugs.length > 0
              ? [
                  `contract groupSlugs missing ${missingCachedTopicSlugs
                    .map((topic) => topic.name)
                    .join(', ')}`,
                ]
              : []),
          ]
          report(
            topicStateErrors.length === 0 ? 'PASS' : 'FAIL',
            `market ${contract.slug} discovery topics`,
            topicStateErrors.length === 0
              ? definition.requiredTopics.map((topic) => topic.name).join(', ')
              : topicStateErrors.join('; ')
          )
          report(
            discovery.has_embedding ? 'PASS' : 'FAIL',
            `market ${contract.slug} related-market embedding`,
            discovery.has_embedding
              ? 'contract_embeddings row is present'
              : 'contract_embeddings row is missing; rerun embedding generation before launch'
          )
        }

        if (!feed) continue
        const expectedFundingPeriodMs = Math.max(HOUR_MS, feed.updatePeriodMs)
        report(
          contract.fundingPeriodMs === expectedFundingPeriodMs
            ? 'PASS'
            : 'FAIL',
          `market ${contract.slug} funding period`,
          `stored=${
            contract.fundingPeriodMs ?? 'missing'
          }ms, expected=${expectedFundingPeriodMs}ms`
        )
        try {
          assertPerpFundingConfig({
            fundingSensitivity: contract.fundingSensitivity,
            maxFundingRate: contract.maxFundingRate,
          })
          if (
            !Number.isFinite(contract.maxLeverage) ||
            contract.maxLeverage <= 1 ||
            contract.maxLeverage > 100
          )
            throw new Error(
              `max leverage ${contract.maxLeverage} is outside (1, 100]`
            )
        } catch (error) {
          report(
            'FAIL',
            `market ${contract.slug} economics`,
            error instanceof Error ? error.message : String(error)
          )
        }
        if (
          !Number.isFinite(contract.maxOraclePriceAgeMs) ||
          contract.maxOraclePriceAgeMs < feed.staleAfterMs
        )
          report(
            'FAIL',
            `market ${contract.slug} oracle tolerance`,
            `${contract.maxOraclePriceAgeMs}ms is below feed health threshold ${feed.staleAfterMs}ms`
          )

        const cachedRejection = validateOraclePoint(feed, null, {
          ts: contract.oraclePriceTime ?? 0,
          price: contract.oraclePrice,
        })
        const cachedFreshness = getOracleFreshness(
          contract.oraclePriceTime,
          contract.maxOraclePriceAgeMs
        )
        if (cachedRejection || cachedFreshness.status !== 'fresh')
          report(
            'FAIL',
            `market ${contract.slug} cached oracle`,
            cachedRejection ??
              `cached point is ${cachedFreshness.status} (${cachedFreshness.ageMs}ms)`
          )
        else
          report(
            'PASS',
            `market ${contract.slug} cached oracle`,
            `${contract.oraclePrice} @ ${new Date(
              contract.oraclePriceTime as number
            ).toISOString()}`
          )

        const latest = feedSnapshots.get(contract.oracleFeedId)
        if (definition?.requiresSourceAsOf) {
          const sourceTimestampReady =
            contract.oracleSourceTime != null &&
            Number.isFinite(contract.oracleSourceTime) &&
            contract.oracleSourceTime > 0 &&
            latest?.sourceTs === contract.oracleSourceTime
          report(
            sourceTimestampReady ? 'PASS' : 'FAIL',
            `market ${contract.slug} source attribution`,
            sourceTimestampReady
              ? `provider data as of ${new Date(
                  contract.oracleSourceTime as number
                ).toISOString()}`
              : 'contract cache is missing or trails the latest provider source timestamp'
          )
        }
        if (
          latest &&
          (contract.oraclePriceTime ?? 0) < latest.latestTs &&
          latest.latestTs - (contract.oraclePriceTime ?? 0) >
            Math.min(feed.staleAfterMs, 5 * MINUTE_MS)
        )
          report(
            'FAIL',
            `market ${contract.slug} oracle application`,
            `contract cache trails published history by ${Math.round(
              (latest.latestTs - (contract.oraclePriceTime ?? 0)) / 1000
            )}s`
          )

        if (
          !Number.isFinite(contract.poolLong) ||
          !Number.isFinite(contract.poolShort) ||
          contract.poolLong < 0 ||
          contract.poolShort < 0
        ) {
          report(
            'FAIL',
            `market ${contract.slug} pools`,
            `invalid pools L=${contract.poolLong}, S=${contract.poolShort}`
          )
          continue
        }

        const ledger = await pg.one<{ balance: number | string }>(
          `select (
             coalesce(sum(
               case when to_type = 'CONTRACT' and to_id = $1
                 then amount else 0 end
             ), 0)
             -
             coalesce(sum(
               case when from_type = 'CONTRACT' and from_id = $1
                 then amount else 0 end
             ), 0)
           ) as balance
           from txns
           where token = 'M$'
             and (
               (to_type = 'CONTRACT' and to_id = $1)
               or (from_type = 'CONTRACT' and from_id = $1)
             )`,
          [contract.id]
        )
        const escrow = {
          ledgerBalance: Number(ledger.balance),
          poolLong: contract.poolLong,
          poolShort: contract.poolShort,
        }
        report(
          isPerpEscrowBalanced(escrow) ? 'PASS' : 'FAIL',
          `market ${contract.slug} cash backing`,
          `ledger=${escrow.ledgerBalance}, pools=${
            escrow.poolLong + escrow.poolShort
          }`
        )

        const positionRows = await pg.manyOrNone<StoredPositionRow>(
          `select * from contract_perp_positions where contract_id = $1`,
          [contract.id]
        )
        const positions = positionRows.map(toPosition)
        const state = {
          pool: { L: contract.poolLong, S: contract.poolShort },
          positions,
        }
        let stateIsSolvent = false
        try {
          assertPerpStateSolvent(state, contract.oraclePrice)
          stateIsSolvent = true
          report(
            'PASS',
            `market ${contract.slug} solvency`,
            `${positions.length} open positions`
          )
        } catch (error) {
          report(
            'FAIL',
            `market ${contract.slug} solvency`,
            error instanceof Error ? error.message : String(error)
          )
        }
        if (stateIsSolvent) {
          for (const side of ['long', 'short'] as const) {
            const capacity = getPerpOpenInterestCapacity(
              side,
              state,
              contract.oraclePrice
            )
            if (!capacity.isWithinLimit)
              report(
                'WARN',
                `market ${contract.slug} ${side} capacity`,
                `open interest ${capacity.openInterest} exceeds current limit ${capacity.limit}; reductions remain available but new exposure is blocked`
              )
          }
        }

        if (definition) {
          if (contract.maxLeverage > definition.recommended.maxLeverage)
            report(
              'WARN',
              `market ${contract.slug} leverage`,
              `${contract.maxLeverage}x exceeds day-one recommendation ${definition.recommended.maxLeverage}x`
            )
          const annualRate = getNominalAnnualFundingRate(
            contract.maxFundingRate,
            expectedFundingPeriodMs
          )
          if (
            Number.isFinite(annualRate) &&
            annualRate >
              definition.recommended.annualMaxFundingRate + Number.EPSILON
          )
            report(
              'WARN',
              `market ${contract.slug} funding cap`,
              `${(annualRate * 100).toFixed(
                1
              )}% nominal annual exceeds recommendation ${(
                definition.recommended.annualMaxFundingRate * 100
              ).toFixed(1)}%`
            )
          if (
            Math.abs(
              contract.fundingSensitivity -
                definition.recommended.fundingSensitivity
            ) > Number.EPSILON
          )
            report(
              'WARN',
              `market ${contract.slug} funding sensitivity`,
              `${contract.fundingSensitivity} differs from day-one recommendation ${definition.recommended.fundingSensitivity}`
            )
          if (
            contract.maxOraclePriceAgeMs >
            definition.recommended.maxOraclePriceAgeMs
          )
            report(
              'WARN',
              `market ${contract.slug} oracle tolerance`,
              `${contract.maxOraclePriceAgeMs}ms exceeds day-one recommendation ${definition.recommended.maxOraclePriceAgeMs}ms`
            )
          if (
            contract.initialSubsidy <
            definition.recommended.subsidyLong +
              definition.recommended.subsidyShort
          )
            report(
              'WARN',
              `market ${contract.slug} initial backing`,
              `M$${contract.initialSubsidy} is below day-one recommendation M$${
                definition.recommended.subsidyLong +
                definition.recommended.subsidyShort
              }`
            )
          const hasPerSideInitialBacking =
            contract.initialPoolLong != null &&
            Number.isFinite(contract.initialPoolLong) &&
            contract.initialPoolShort != null &&
            Number.isFinite(contract.initialPoolShort)
          if (!hasPerSideInitialBacking) {
            report(
              phase === 'feeds' ? 'WARN' : 'FAIL',
              `market ${contract.slug} per-side initial backing`,
              'missing initialPoolLong/initialPoolShort; recreate through the current API so launch skew is auditable'
            )
          } else {
            const initialPoolLong = contract.initialPoolLong as number
            const initialPoolShort = contract.initialPoolShort as number
            if (
              Math.abs(
                initialPoolLong + initialPoolShort - contract.initialSubsidy
              ) > 0.000001
            )
              report(
                'FAIL',
                `market ${contract.slug} initial backing consistency`,
                `L=${initialPoolLong} + S=${initialPoolShort} does not equal initialSubsidy=${contract.initialSubsidy}`
              )
            if (
              initialPoolLong < definition.recommended.subsidyLong ||
              initialPoolShort < definition.recommended.subsidyShort
            )
              report(
                'WARN',
                `market ${contract.slug} per-side initial backing`,
                `L=M$${initialPoolLong}, S=M$${initialPoolShort}; recommendation L=M$${definition.recommended.subsidyLong}, S=M$${definition.recommended.subsidyShort}`
              )
          }
        }

        const fundingRows = await pg.manyOrNone<{ ts: string }>(
          `select ts from contract_perp_funding_events
           where contract_id = $1 and ts > now() - interval '7 days'
           order by ts asc`,
          [contract.id]
        )
        const fundingTimes = fundingRows.map((row) =>
          new Date(row.ts).getTime()
        )
        const tooClose = fundingTimes.find(
          (time, index) =>
            index > 0 &&
            time - fundingTimes[index - 1] < expectedFundingPeriodMs - MINUTE_MS
        )
        report(
          tooClose === undefined ? 'PASS' : 'FAIL',
          `market ${contract.slug} funding cadence`,
          tooClose === undefined
            ? `${fundingTimes.length} events in the last 7d; no double-run`
            : `events are closer than the ${expectedFundingPeriodMs}ms period`
        )
        const lastFundingTime = fundingTimes[fundingTimes.length - 1]
        const now = Date.now()
        const fundingIsDue = shouldApplyFunding({
          now,
          lastFundingTime,
          fundingStartTime: contract.createdTime,
          latestOracleTime: latest?.latestTs,
          fundingPeriodMs: expectedFundingPeriodMs,
        })
        const fundingAnchor = lastFundingTime ?? contract.createdTime
        if (
          fundingIsDue &&
          now - fundingAnchor > expectedFundingPeriodMs + 2 * HOUR_MS
        )
          report(
            'FAIL',
            `market ${contract.slug} funding liveness`,
            `funding is overdue by ${Math.round(
              (now - fundingAnchor - expectedFundingPeriodMs) / MINUTE_MS
            )}m`
          )
        if (
          lastFundingTime != null &&
          contract.lastFundingTime !== lastFundingTime
        )
          report(
            'FAIL',
            `market ${contract.slug} funding cache`,
            `contract=${
              contract.lastFundingTime ?? 'missing'
            }, event=${lastFundingTime}`
          )
      }

      for (const definition of PERP_LAUNCH_MARKETS) {
        const matches = contracts.filter(
          (contract) => contract.oracleFeedId === definition.feedId
        )
        if (phase === 'feeds') {
          if (matches.length === 0)
            report(
              'WARN',
              `launch market ${definition.feedId}`,
              'not created yet (allowed in feeds phase)'
            )
          else if (matches.length > 1)
            report(
              'FAIL',
              `launch market ${definition.feedId}`,
              `${matches.length} unresolved markets use this feed`
            )
          continue
        }
        if (matches.length !== 1) {
          report(
            'FAIL',
            `launch market ${definition.feedId}`,
            `expected exactly one unresolved market, found ${matches.length}`
          )
          continue
        }
        const expectedVisibility = phase === 'unlisted' ? 'unlisted' : 'public'
        report(
          matches[0].visibility === expectedVisibility ? 'PASS' : 'FAIL',
          `launch market ${definition.feedId} visibility`,
          `is ${matches[0].visibility}; expected ${expectedVisibility}`
        )
      }
    })

    await inspect('resolved position cleanup', async () => {
      const row = await pg.one<{ count: number | string }>(
        `select count(*) as count
         from contract_perp_positions p
         left join contracts c on c.id = p.contract_id
         where c.id is null
            or c.mechanism <> 'perp'
            or c.resolution_time is not null`
      )
      const count = Number(row.count)
      report(
        count === 0 ? 'PASS' : 'FAIL',
        'resolved position cleanup',
        count === 0
          ? 'no resolved market retains an open position'
          : `${count} positions remain on resolved markets`
      )
    })

    if (phase === 'public') {
      for (const definition of PERP_LAUNCH_MARKETS) {
        report(
          acknowledgesLatencyRisk ? 'WARN' : 'FAIL',
          `oracle latency risk ${definition.feedId}`,
          `${definition.latencyArbitrageRisk}${
            acknowledgesLatencyRisk
              ? ' (explicitly acknowledged for this run)'
              : ' Run only after mitigation, or pass --acknowledge-latency-risk after a deliberate launch decision.'
          }`
        )
      }
    }

    report(
      'WARN',
      'external alert policies',
      'database checks cannot verify GCP log/presence policies; complete the runbook alert drill manually'
    )
    log(
      `PERP preflight complete: ${failures} failure(s), ${warnings} warning(s)`
    )
    if (failures > 0)
      throw new Error(
        `PERP launch preflight failed with ${failures} failure(s)`
      )
  })

const toPosition = (row: StoredPositionRow): PerpPosition => {
  if (row.direction !== 'long' && row.direction !== 'short')
    throw new Error(`Invalid stored PERP direction ${row.direction}`)
  return {
    contractId: row.contract_id,
    userId: row.user_id,
    direction: row.direction,
    size: Number(row.size),
    costBasis: Number(row.cost_basis),
    originalCostBasis: Number(row.original_cost_basis),
    entryPrice: Number(row.entry_price),
    leverage: Number(row.leverage),
    liquidationPrice: Number(row.liquidation_price),
    openedTime: new Date(row.opened_time).getTime(),
    updatedTime: new Date(row.updated_time).getTime(),
  }
}
