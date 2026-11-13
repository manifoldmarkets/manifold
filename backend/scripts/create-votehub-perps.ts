import { uniq } from 'lodash'

import { getApiUrl } from 'common/api/utils'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { HOUR_MS, YEAR_MS } from 'common/util/time'
import { getLocalEnv } from 'shared/init-admin'
import { describeOracleFeedLifecycle, getOracleFeed } from 'shared/oracle-feeds'
import {
  PERP_LAUNCH_MARKETS,
  PERP_LAUNCH_PENDING_MARKETS,
  PERP_LAUNCH_RETIRED_MARKETS,
  PerpLaunchMarketDefinition,
  getPerpLaunchCreatorId,
} from 'shared/perps/launch-manifest'
import { log } from 'shared/utils'
import {
  VOTEHUB_FEED_SPECS,
  VoteHubFeedSpec,
  getVoteHubFeedSpec,
} from 'shared/votehub-feeds'
import { runScript } from './run-script'

// Create the launch market for one or more VoteHub average feeds, from the
// launch manifest. Written for the 2028 generic-ballot pair, whose two
// markets must carry identical settings and parallel copy; the 2026 market
// and the Vance market were created by hand in the admin form.
//
// Default: inspect and print, with no writes. --apply creates UNLISTED
// markets through the normal authenticated API in the explicitly selected
// environment, as the official Manifold creator (the house account pays the
// backing and receives the residual at settlement).
//
//   NEXT_PUBLIC_FIREBASE_ENV=PROD MANIFOLD_API_KEY=<official creator's key> \
//     npx ts-node create-votehub-perps.ts \
//       --feed=votehub-generic-ballot-2028-dem,votehub-generic-ballot-2028-rep \
//       [--apply]
//
// Every precondition is checked before anything is written, for every
// requested feed, and one failure aborts the whole run:
//   - the feed is a VoteHub spec, registered, LIVE (no lifecycle) and
//     creation-enabled — a feed still awaiting its source, or retired, is
//     refused with the registry's reason rather than the API's 400;
//   - it is in PERP_LAUNCH_MARKETS (pending and retired entries are named as
//     such) — the manifest's reviewed settings are what gets created;
//   - its history meets the manifest's minimumHistory and its latest point is
//     younger than the market's maxOraclePriceAgeMs, so the market does not
//     open paused;
//   - no open market exists on the feed.
//
// The description is generated from the spec so the two 2028 markets say
// the same things in the same order as the 2026 market did: what the price
// is and is not, the 5-minute cadence, the pause rule, the settlement rule
// for a cycle-bound series (settled by hand at the last accepted value after
// election day, never on the result), the source link and the CC BY 4.0
// credit.
//
// After creation: check the market page, add the slugs to POLLING_PERPS in
// web/public/data/elections-data.ts so the /election page shows them, and
// make them public when ready (creation is unlisted by design).

const PARTY_BY_ANSWER_KEY: Record<string, string> = {
  dem: 'Democratic',
  rep: 'Republican',
}

const formatDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** Market copy, in the shape and order of the 2026 generic-ballot market. */
export const buildVoteHubMarketDescription = (
  spec: VoteHubFeedSpec,
  market: PerpLaunchMarketDefinition
) => {
  const party = PARTY_BY_ANSWER_KEY[spec.answerKey]
  const cycle = spec.seriesEndsOn?.slice(0, 4)
  const pauseHours = Math.round(
    market.recommended.maxOraclePriceAgeMs / HOUR_MS
  )
  const paragraphs: string[] = []

  if (party && cycle) {
    const other = party === 'Democratic' ? 'Republican' : 'Democratic'
    paragraphs.push(
      `Tracks the ${party} percentage in VoteHub’s published time-weighted ${cycle} generic-ballot polling average. ` +
        `This is the percentage choosing ${party}—not the ${party}-minus-${other} margin, a two-party-normalized share, a forecast, or the election result.`
    )
  } else {
    paragraphs.push(
      `Tracks the \`${spec.answerKey}\` percentage in VoteHub’s published time-weighted ${spec.label} polling average. ` +
        `This is a share on a 0–100 scale, not a margin or a probability.`
    )
  }

  paragraphs.push(
    'Manifold checks VoteHub every 5 minutes and updates the oracle whenever VoteHub’s value changes. Historical chart points come from VoteHub’s published daily series.'
  )
  paragraphs.push(
    `If no sufficiently fresh and valid value can be published for ${pauseHours} hours, trading pauses.`
  )
  if (spec.seriesEndsOn)
    paragraphs.push(
      `After ${formatDay(
        spec.seriesEndsOn
      )}, this market will be manually settled at the latest accepted VoteHub ${
        party ? `${party}-share` : spec.answerKey
      } value. **It does not settle based on the election result.**`
    )
  paragraphs.push(
    `Source: https://votehub.com/polls/?poll=${spec.averageKey}\n\nLicensed under CC BY 4.0.`
  )
  return paragraphs.join('\n\n')
}

if (require.main === module)
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    const feedArg = process.argv
      .find((arg) => arg.startsWith('--feed='))
      ?.slice('--feed='.length)
    // Deduplicated: a repeated id would pass every check, create its market,
    // and then fail the second POST on the open-market check — after a write.
    const feedIds = uniq(
      (feedArg ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    if (feedIds.length === 0)
      throw new Error(
        `pass --feed=<feedId>[,<feedId>]; VoteHub feeds: ${VOTEHUB_FEED_SPECS.map(
          (s) => s.feedId
        ).join(', ')}`
      )
    if (
      !['DEV', 'PROD'].includes(process.env.NEXT_PUBLIC_FIREBASE_ENV ?? '') ||
      ENV !== getLocalEnv()
    )
      throw new Error(
        'Set NEXT_PUBLIC_FIREBASE_ENV explicitly to DEV or PROD and select the matching Firebase project'
      )

    const problems: string[] = []
    const plans: {
      spec: VoteHubFeedSpec
      market: PerpLaunchMarketDefinition
      body: Record<string, unknown>
    }[] = []
    for (const feedId of feedIds) {
      const spec = getVoteHubFeedSpec(feedId)
      if (!spec) {
        problems.push(`${feedId}: not a VoteHub feed spec`)
        continue
      }
      const feed = getOracleFeed(feedId)
      if (!feed) {
        problems.push(`${feedId}: not in the oracle feed registry`)
        continue
      }
      if (feed.lifecycle) {
        problems.push(
          `${feedId}: ${describeOracleFeedLifecycle(
            feed.lifecycle
          )} — not creatable`
        )
        continue
      }
      if (!feed.marketCreationEnabled) {
        problems.push(`${feedId}: market creation is disabled in the registry`)
        continue
      }
      const market = PERP_LAUNCH_MARKETS.find((m) => m.feedId === feedId)
      if (!market) {
        const pending = PERP_LAUNCH_PENDING_MARKETS.find(
          (m) => m.feedId === feedId
        )
        const retired = PERP_LAUNCH_RETIRED_MARKETS.find(
          (m) => m.feedId === feedId
        )
        problems.push(
          pending
            ? `${feedId}: still PENDING in the launch manifest — ${pending.pendingReason}`
            : retired
            ? `${feedId}: RETIRED in the launch manifest — ${retired.retiredReason}`
            : `${feedId}: has no launch manifest entry`
        )
        continue
      }
      const ticker = getPerpFeedTicker(feedId)
      if (!ticker) {
        problems.push(`${feedId}: no canonical ticker in PERP_FEED_TICKERS`)
        continue
      }

      const open = await pg.manyOrNone<{ id: string; slug: string }>(
        `select id, data->>'slug' as slug from contracts
         where mechanism = 'perp' and resolution_time is null
           and data->>'oracleFeedId' = $1`,
        [feedId]
      )
      if (open.length > 0) {
        problems.push(
          `${feedId}: already has an open market (${open
            .map((c) => `${c.slug} ${c.id}`)
            .join(', ')})`
        )
        continue
      }
      const history = await pg.one<{
        points: string
        first_ts: string | null
        last_ts: string | null
      }>(
        `select count(*)::text as points, min(ts) as first_ts, max(ts) as last_ts
         from oracle_prices where feed_id = $1`,
        [feedId]
      )
      const points = Number(history.points)
      const firstTs = history.first_ts
        ? new Date(history.first_ts).getTime()
        : null
      const lastTs = history.last_ts
        ? new Date(history.last_ts).getTime()
        : null
      const spanMs = firstTs != null && lastTs != null ? lastTs - firstTs : 0
      if (
        points < market.minimumHistory.points ||
        spanMs < market.minimumHistory.spanMs
      )
        problems.push(
          `${feedId}: history is ${points} points over ${Math.round(
            spanMs / (24 * HOUR_MS)
          )}d; the manifest wants ${
            market.minimumHistory.points
          } over ${Math.round(
            market.minimumHistory.spanMs / (24 * HOUR_MS)
          )}d — backfill first (backfill-votehub-oracle.ts --feed=${feedId})`
        )
      if (
        lastTs == null ||
        Date.now() - lastTs > market.recommended.maxOraclePriceAgeMs
      )
        problems.push(
          `${feedId}: latest point ${
            lastTs ? new Date(lastTs).toISOString() : 'none'
          } is older than the market's ${Math.round(
            market.recommended.maxOraclePriceAgeMs / HOUR_MS
          )}h tolerance; it would open paused — let the publisher catch up first`
        )

      plans.push({
        spec,
        market,
        body: {
          question: market.question,
          descriptionMarkdown: buildVoteHubMarketDescription(spec, market),
          oracleFeedId: feedId,
          ticker,
          visibility: 'unlisted',
          maxLeverage: market.recommended.maxLeverage,
          // Annual cap scaled to the funding period create-perp will derive
          // from the feed: max(1h, updatePeriodMs), one day for VoteHub.
          maxFundingRate:
            (market.recommended.annualMaxFundingRate *
              Math.max(HOUR_MS, feed.updatePeriodMs)) /
            YEAR_MS,
          fundingSensitivity: market.recommended.fundingSensitivity,
          maxOraclePriceAgeMs: market.recommended.maxOraclePriceAgeMs,
          subsidyLong: market.recommended.subsidyLong,
          subsidyShort: market.recommended.subsidyShort,
          // Fees omitted on purpose: the handler stamps the feed default.
        },
      })
    }

    const callerId = getPerpLaunchCreatorId(ENV)
    const backing = plans.reduce(
      (sum, p) =>
        sum +
        p.market.recommended.subsidyLong +
        p.market.recommended.subsidyShort,
      0
    )
    log(
      JSON.stringify(
        {
          environment: ENV,
          apply,
          callerId,
          backingRequired: backing,
          markets: plans.map((p) => p.body),
          problems,
        },
        null,
        2
      )
    )
    if (problems.length > 0) {
      if (apply)
        throw new Error(
          'Creation aborted before any writes: see problems above'
        )
      process.exitCode = 1
      return
    }
    if (!apply || plans.length === 0) return

    const key = process.env.MANIFOLD_API_KEY
    if (!key)
      throw new Error('MANIFOLD_API_KEY for the official creator is required')
    const apiUrl = new URL(getApiUrl('create-perp'))
    if (
      apiUrl.host !== ENV_CONFIG.apiEndpoint &&
      !['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname)
    )
      throw new Error(
        'Refusing creation on an API outside the selected environment'
      )
    const headers = {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    }
    const me = await fetch(getApiUrl('me'), {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    if (!me.ok) throw new Error(`GET me failed: HTTP ${me.status}`)
    const caller: { id?: string; balance?: number } = await me.json()
    if (caller.id !== callerId)
      throw new Error('API key does not belong to the official creator')
    // Every market's backing comes out of this one balance, so check the
    // total up front: otherwise the first market is created and the second
    // fails, leaving half a pair live.
    const balance = Number(caller.balance)
    if (!Number.isFinite(balance) || balance < backing)
      throw new Error(
        `Insufficient backing: the official creator has M${
          Number.isFinite(balance) ? Math.floor(balance) : '?'
        } and the ${plans.length} market(s) need M${backing} in total`
      )

    for (const plan of plans) {
      const response = await fetch(getApiUrl('create-perp'), {
        method: 'POST',
        headers,
        body: JSON.stringify(plan.body),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok)
        throw new Error(
          `Creation failed for ${plan.spec.feedId}: HTTP ${
            response.status
          } ${await response.text()}. Stop and rerun inspection before retrying.`
        )
      const market = await response.json()
      log(
        `Created unlisted ${plan.spec.feedId}: ${market.id} (${market.slug}) — add the slug to POLLING_PERPS in web/public/data/elections-data.ts`
      )
      if (market.creatorId !== callerId)
        throw new Error(
          `${market.id} was created under creator ${market.creatorId}, not the official creator (${callerId}). Stop and audit before retrying.`
        )
    }
  })
