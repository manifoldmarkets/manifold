import { createPerp } from 'api/create-perp'
import { DAY_MS } from 'common/util/time'
import { resolvePerp } from 'shared/perps/engine'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// One-shot (2026-07-27): retire the legacy hourly-funding Trump approval
// perp and recreate it on the same feed with a per-contract funding period.
//
// Run with NEXT_PUBLIC_FIREBASE_ENV=DEV — common's ENV_CONFIG defaults to
// PROD without it, so admin-gated handlers (createPerp) reject the dev
// admin ids even though runScript connects to the dev database.
// The old market predates fundingPeriodMs, so it funded 24x per oracle move
// — the dodgeable configuration the period change exists to fix. Recreating
// (rather than hand-editing the frozen fields) settles the two open
// positions at market, keeps the price chart intact (history lives on the
// feed, not the contract), and exercises the create-time derivation that
// prod will use.

const DEV_MANIFOLD = 'MxyCh2xvsFMFywwjg3Az0w4xP5B3'
const OLD_CONTRACT_ID = 'dnyI0n9zCAzz'
const FEED_ID = 'trump-approval-rating'

// f_max is per PERIOD (§ common/contract.ts). The old market's hourly f_max
// (0.000114 = 100%/yr / 8760) targeted 100%/yr of margin; at one funding
// event per day the same annual ceiling is 1/365. Set deliberately, not
// inherited — inheriting the hourly value at a daily period would cut the
// cap 24x.
const MAX_FUNDING_RATE_DAILY = 1 / 365

if (require.main === module)
  runScript(async ({ pg }) => {
    const old = await pg.one(
      `select slug, resolution_time from contracts where id = $1`,
      [OLD_CONTRACT_ID]
    )
    if (old.slug !== 'trump-approval-rating')
      throw new Error(`unexpected slug ${old.slug} — wrong contract id?`)
    if (old.resolution_time != null) {
      log('old market already resolved — skipping to recreate')
    } else {
      const res = await resolvePerp(OLD_CONTRACT_ID, DEV_MANIFOLD)
      log(
        `resolved ${OLD_CONTRACT_ID} at ${res.finalPrice}: ` +
          `${res.closedPositions.length} positions closed ` +
          `(${res.closedPositions
            .map((p) => `${p.userId.slice(0, 8)} ${p.direction} → ${p.payout.toFixed(2)}`)
            .join(', ')}), ` +
          `residual ${res.residualPayout.toFixed(0)} to creator`
      )
    }

    const created = await createPerp(
      {
        question: 'Trump Approval Rating',
        description: 'According to VoteHub poll aggregator',
        visibility: 'public',
        oracleFeedId: FEED_ID,
        maxLeverage: 100,
        maxFundingRate: MAX_FUNDING_RATE_DAILY,
        fundingSensitivity: 1,
        // Unchanged from the old market: 30h, above the feed's 26h
        // staleAfterMs, so one late daily write doesn't freeze trading.
        maxOraclePriceAgeMs: 108000000,
        subsidyLong: 5000,
        subsidyShort: 5000,
      } as any,
      { uid: DEV_MANIFOLD } as any,
      {} as any
    )
    const market = 'result' in created ? (created as any).result : created
    log(`created ${market.id} (${market.url ?? market.slug})`)

    // The whole point: the create path must have derived and frozen the
    // daily period from the feed registry.
    const check = await pg.one(
      `select data->>'fundingPeriodMs' as period, data->>'maxFundingRate' as fmax
       from contracts where id = $1`,
      [market.id]
    )
    if (Number(check.period) !== DAY_MS)
      throw new Error(
        `fundingPeriodMs is ${check.period}, expected ${DAY_MS} — create path did not derive the daily period`
      )
    log(`verified: fundingPeriodMs=${check.period}, maxFundingRate=${check.fmax}`)
  })
