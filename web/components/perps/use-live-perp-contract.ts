import { useCallback, useEffect, useRef, useState } from 'react'

import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { PerpContract } from 'common/contract'
import { isNewerPerpQuote, PerpQuote } from 'common/perps/quote'
import { api } from 'web/lib/api/api'
import { scheduleFreshBurst } from './use-perp-positions'

// Slow-moving contract fields — resolution, volume, admin-tunable config.
// Edge-cached `market/:id` is fine for these; seconds of staleness on a
// leverage cap is harmless.
const META_POLL_MS = 15_000

// Fallback price poll, used only while the websocket is NOT delivering ticks.
// Hits `get-perp-quote`, which is `no-cache` — unlike `market/:id`, whose
// max-age=5 + stale-while-revalidate=10 can hand back a 15s-old price.
const QUOTE_FALLBACK_POLL_MS = 4_000

// How long a push keeps the fallback poll quiet. Comfortably longer than the
// fastest feed's tick so a healthy socket costs zero extra requests, short
// enough that a socket which dies silently is covered within a few seconds.
const PUSH_CONSIDERED_FRESH_MS = 12_000

/**
 * Overlay live market state onto an SSR contract.
 *
 * Price arrives by websocket push on every oracle tick (sub-second), with an
 * uncached poll as a fallback when the socket is down, and the edge-cached
 * meta poll as a last-resort producer so the page can never do worse than the
 * pre-push behavior (see the compatibility note in the meta poll). Before
 * this, the only path was a 15s poll of an endpoint the edge cached for up to
 * another 15s, so the displayed price could trail the executable one by ~30
 * seconds — at high leverage, a materially different market from the one you
 * close into.
 *
 * The two slices are tracked separately on purpose. They arrive on different
 * cadences from different endpoints, and folding them into one object let a
 * stale metadata response overwrite a fresh pushed price.
 */
export const useLivePerpContract = (ssrContract: PerpContract) => {
  const [quote, setQuote] = useState<PerpQuote | null>(null)
  const [meta, setMeta] = useState<Partial<PerpContract> | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Wall-clock of the last RECEIVED push (applied or not), used to decide
  // whether the fallback poll needs to run — a rejected replay still proves
  // the socket is alive. A ref so arriving ticks don't re-render the tree.
  const lastPushAt = useRef(0)

  // Wall-clock of the last push that was actually APPLIED (strictly newer
  // than the retained quote). Compared against lastMetaAt to decide which
  // source's POOLS are fresher (see the merge below) — receipt order, not
  // tick time, because pools move without advancing oraclePriceTime. Kept
  // separate from lastPushAt so a reconnecting socket's replayed OLD quotes
  // cannot pin the retained quote's stale pools over a newer meta body.
  const lastAppliedPushAt = useRef(0)

  // oraclePriceTime of the retained quote, mirrored into a ref so the
  // subscription callback (captured once at subscribe time) can tell whether
  // an incoming push will apply without reading React state.
  const latestQuoteTime = useRef<number | undefined>(undefined)

  // Wall-clock of the last applied meta poll body — the other half of the
  // pool-freshness comparison.
  const lastMetaAt = useRef(0)

  // Never rewind. Pushes, fallback polls, and a reconnecting socket's replay
  // all race each other, so ordering on the oracle timestamp rather than on
  // arrival is what keeps the displayed price monotonic in market time.
  //
  // This compares only against the previously applied quote, never against the
  // SSR contract, which leaves the callback dependency-free and stable for the
  // life of the hook. That matters here specifically: useApiSubscription
  // captures onBroadcast at subscribe time and does not re-subscribe when it
  // changes, so a callback closing over changing state would go stale on the
  // wire. The SSR baseline is applied once at merge time instead.
  const applyQuote = useCallback((incoming: PerpQuote) => {
    if (isNewerPerpQuote(latestQuoteTime.current, incoming.oraclePriceTime)) {
      latestQuoteTime.current = incoming.oraclePriceTime
    }
    setQuote((previous) =>
      isNewerPerpQuote(previous?.oraclePriceTime, incoming.oraclePriceTime)
        ? incoming
        : previous
    )
  }, [])

  useApiSubscription({
    topics: [`contract/${ssrContract.id}/perp-quote`],
    enabled: !ssrContract.isResolved,
    onBroadcast: (msg) => {
      const incoming = (msg.data as { quote?: PerpQuote }).quote
      if (!incoming || incoming.contractId !== ssrContract.id) return
      lastPushAt.current = Date.now()
      if (isNewerPerpQuote(latestQuoteTime.current, incoming.oraclePriceTime)) {
        lastAppliedPushAt.current = Date.now()
      }
      applyQuote(incoming)
    },
  })

  // Fallback price poll. Skips entirely while pushes are arriving, so on a
  // fast-tick feed a healthy socket adds no request load; feeds that tick
  // slower than the freshness window ride this poll between ticks by design.
  // Resolved markets have a frozen settlement price and never tick again, so
  // they get no poll at all.
  const resolved = ssrContract.isResolved || meta?.isResolved === true
  useEffect(() => {
    if (resolved) return
    let cancelled = false
    const loadQuote = () =>
      api(
        'get-perp-quote',
        { contractId: ssrContract.id },
        { cache: 'no-store' }
      )
        .then((incoming) => {
          if (!cancelled) applyQuote(incoming)
        })
        .catch(() => {})

    // Always fetch once on mount: the socket may take a moment to connect, and
    // SSR HTML can itself be cached.
    loadQuote()
    const id = setInterval(() => {
      if (Date.now() - lastPushAt.current < PUSH_CONSIDERED_FRESH_MS) return
      loadQuote()
    }, QUOTE_FALLBACK_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [ssrContract.id, applyQuote, resolved])

  // Slow slice: resolution, volume, and the admin-tunable config that every
  // open page must converge on (update-perp-config edits leverage and fee
  // live). Pools/OI/funding live here and ONLY here — see the merge note for
  // why the quote never overrides them. The trade-triggered burst below is
  // what refreshes pools after the user's own trade.
  useEffect(() => {
    let cancelled = false
    const poll = (fresh: boolean) =>
      api(
        'market/:id',
        { id: ssrContract.id, lite: true },
        fresh ? { cache: 'no-store' } : undefined
      )
        .then((market) => {
          if (
            cancelled ||
            market.outcomeType !== 'PERP' ||
            market.oraclePrice == null ||
            market.poolLong == null ||
            market.poolShort == null
          )
            return

          const resolution =
            market.resolution === 'MKT' || market.resolution === 'CANCEL'
              ? market.resolution
              : undefined
          lastMetaAt.current = Date.now()
          setMeta((previous) =>
            // Never resurrect a settled market from a cached body.
            (ssrContract.isResolved || previous?.isResolved) &&
            !market.isResolved
              ? previous
              : {
                  poolLong: market.poolLong,
                  poolShort: market.poolShort,
                  openInterestLong: market.openInterestLong,
                  openInterestShort: market.openInterestShort,
                  fundingRate: market.fundingRate,
                  volume: market.volume,
                  uniqueBettorCount: market.uniqueBettorCount,
                  isResolved: market.isResolved,
                  resolution,
                  resolutionTime: market.resolutionTime,
                  resolverId: market.resolverId,
                  resolvedOraclePrice: market.resolvedOraclePrice,
                  lastUpdatedTime: market.lastUpdatedTime,
                  ...(market.lastFundingTime != null
                    ? { lastFundingTime: market.lastFundingTime }
                    : {}),
                  ...(market.maxLeverage != null
                    ? { maxLeverage: market.maxLeverage }
                    : {}),
                  ...(market.takerFeeBps != null
                    ? { takerFeeBps: market.takerFeeBps }
                    : {}),
                  ...(market.takerFeeImpact != null
                    ? { takerFeeImpact: market.takerFeeImpact }
                    : {}),
                }
          )

          // Also feed the price fields through the quote pipeline, as the
          // lowest-priority producer. This is the compatibility path: against
          // an API that lacks get-perp-quote and the push (mid-deploy, or a
          // backend rollback), the page degrades to exactly the pre-push
          // behavior — a 15s poll of an edge-cached body — instead of freezing
          // at the SSR price and eventually showing a false "trading paused"
          // banner. The strictly-newer guard in applyQuote means this cached
          // body can never displace a pushed price.
          applyQuote({
            contractId: ssrContract.id,
            oraclePrice: market.oraclePrice,
            poolLong: market.poolLong,
            poolShort: market.poolShort,
            ...(market.oraclePriceTime != null
              ? { oraclePriceTime: market.oraclePriceTime }
              : {}),
            ...(market.oracleSourceTime != null
              ? { oracleSourceTime: market.oracleSourceTime }
              : {}),
          })
        })
        .catch(() => {})

    // A trade-triggered refresh bursts past the market endpoint's stale cache
    // window; ordinary updates stay on the light poll.
    const cancelBurst =
      refreshKey > 0
        ? scheduleFreshBurst(() => poll(true))
        : (poll(false), undefined)
    const interval = setInterval(() => poll(false), META_POLL_MS)
    return () => {
      cancelled = true
      cancelBurst?.()
      clearInterval(interval)
    }
  }, [ssrContract.id, ssrContract.isResolved, refreshKey, applyQuote])

  const refresh = () => setRefreshKey((key) => key + 1)

  // Quote wins over meta for the PRICE fields: it is the fresher source and
  // the only push-driven one. Fields are picked explicitly so the quote's
  // own `contractId` does not leak onto the contract, and so adding a field
  // to PerpQuote can never silently start overwriting unrelated contract
  // state. The SSR baseline is applied here rather than in applyQuote, which
  // stays dependency-free.
  //
  // POOLS are ordered by RECEIPT, not tick time: trades, funding transfers,
  // and liquidity edits all move poolLong/poolShort WITHOUT advancing
  // oraclePriceTime, so a tick-time pool snapshot pinned by timestamp would
  // shadow a fresher meta poll for the whole gap between ticks — up to a day
  // on the daily feeds. Instead a pushed quote's pools apply only while the
  // push is more recent than the last applied meta body (quote.ts explicitly
  // blesses consuming its pools by arrival order). On a fast-tick feed that
  // replaces the edge-cached meta pools (max-age 5 + swr 10, polled every
  // 15s) with a ≤tick-old DB read — which matters since the size-dependent
  // taker fee prices real money off these pools — while on slow feeds and
  // after the post-trade no-store meta burst, meta immediately wins back.
  // OI/funding stay meta-only, keeping the funding math's inputs one vintage.
  //
  // `oracleSourceTime` is copied even when absent from the quote: source time
  // describes a specific observation, so carrying the previous one forward
  // alongside a newer price would misattribute it.
  const quoteIsFresher =
    quote != null &&
    isNewerPerpQuote(ssrContract.oraclePriceTime, quote.oraclePriceTime)
  const pushedPoolsAreFresher =
    quote != null && lastAppliedPushAt.current > lastMetaAt.current
  const contract = {
    ...ssrContract,
    ...meta,
    ...(quoteIsFresher && quote != null
      ? {
          oraclePrice: quote.oraclePrice,
          oraclePriceTime: quote.oraclePriceTime,
          oracleSourceTime: quote.oracleSourceTime,
        }
      : {}),
    ...(pushedPoolsAreFresher && quote != null
      ? {
          poolLong: quote.poolLong,
          poolShort: quote.poolShort,
        }
      : {}),
  } as PerpContract

  return { contract, refresh, refreshKey }
}
