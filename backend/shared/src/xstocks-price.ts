import { getConsensusMedian } from 'common/perps/oracle'
import { PoolKind, readPoolSpotPrice } from 'common/perps/solana-pools'
import { readGateTickerMid } from 'common/perps/xstocks'

import { SolanaAccount, getMultipleAccounts } from './solana-rpc'
import { log } from './utils'

// USD prices for tokenized equities (xStocks by Backed Finance), composited
// across the venues where the tokens actually trade. Same validation stance
// as btc-price.ts: the oracle point is a median gated on cross-venue
// agreement, so one venue being down, rate-limited, or wicked by a thin-book
// print can't move the feed.
//
// Sources, and why these (re-probed 2026-08-27):
//   - On-chain pools, read directly from Solana account state (see
//     common/perps/solana-pools.ts). This is where the volume is: the main
//     Raydium pool alone does 5-15x Gate's daily turnover on every token, and
//     it is where the issuer's mint/redeem arbitrage pins the token to NAV.
//     Each token lists its two or three deepest USDC pools; they are separate
//     liquidity and separate LPs, so they are separate votes, and all of them
//     arrive in ONE RPC call per tick regardless of how many tokens there are.
//   - Gate spot (USDT book), the one CEX that lists all four on a public API.
//     Bybit delisted xStocks, Kraken does not expose them on its public spot
//     API, and Bitget/KuCoin/OKX/Crypto.com do not list them.
// Dropped:
//   - Jupiter (2026-08-27): an aggregator over the same pools, keyless-limited
//     to 30 req/min, and keyed access means a licence. See solana-pools.ts.
//   - MEXC (2026-08-27): its user agreement (cl. 17(d)) prohibits "trading
//     services that make use of MEXC quotes" without written consent and
//     (cl. 17(f)) automated access to its properties, and it lists the US as
//     a prohibited jurisdiction. Not a venue to build a US product's oracle on.
//
// Quote currency: the pools quote in USDC, Gate in USDT. A stablecoin depeg
// beyond the divergence tolerance splits the venues and (correctly) stalls
// the feed rather than publishing a number denominated in a broken coin.
//
// Units: pools trade the RAW token, and so does Gate's book. xStocks pay
// dividends by scaling holder balances (Token-2022 scaled-ui-amount), so the
// raw token drifts above the underlying ETF by the accrued multiplier; that
// is the instrument this perp tracks and it is the same unit on every source
// here, so nothing needs reconciling. (Jupiter's per-SCALED-unit price was
// the one source that needed it; it is gone.)

// Must stay comfortably under the oracle tick interval (ORACLE_TICK_PERIOD_MS,
// 2s — not importable here, since scheduler depends on shared and not the
// reverse). Same reasoning as btc-price.ts: dispatch skips a feed while its
// previous run is in flight, so a source that hangs to a long timeout costs
// multiple ticks, and bounding it below the tick turns "everyone waits for
// the slowest venue" into "the slow venue misses this tick's median" — which
// is tolerable because every feed has at least three sources and two agree
// on their own. Gate measured ~1s round-trip from outside GCP; if
// `[xstocks-price] ... gate: TimeoutError` turns out to be chronic from prod
// egress, raise this toward (but keep under) the tick rather than dropping
// the source.
const FETCH_TIMEOUT_MS = 1_500
const MAX_SOURCE_DIVERGENCE_FRAC = 0.02

// The four feeds are dispatched independently by the tick (each behind its
// own in-flight guard), but their pools all come from one RPC call: a
// snapshot fetched within this window is shared by every feed that asks.
// Shorter than the tick so no feed can ever be handed the previous tick's
// snapshot.
const POOL_SNAPSHOT_SHARE_MS = 1_000

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDC_DECIMALS = 6
// Every xStocks mint is 8 decimals. Raydium pools also store this and the
// reader fails closed if it ever disagrees.
const XSTOCK_DECIMALS = 8

export type XStockPool = {
  kind: PoolKind
  /** Pool account address. Pinned, not discovered: an oracle must not follow
   * liquidity to whatever pool an aggregator lists today. Re-probe the pool
   * set when a token's volume moves (see the launch runbook). */
  address: string
}

export type XStockSpec = {
  /** Display symbol as the issuer styles it, e.g. 'SPYx'. */
  symbol: string
  /** Solana mint address. */
  mint: string
  gatePair: string
  /** USDC pools, deepest first. Two is the floor: with only Gate beside a
   * single pool, either venue hiccuping skips the tick. */
  pools: readonly XStockPool[]
}

// Pool liquidity as probed 2026-08-27 is noted per entry so a later reader can
// tell whether the set has gone stale.
export const XSTOCK_SPECS = {
  SPYX: {
    symbol: 'SPYx',
    mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
    gatePair: 'SPYX_USDT',
    pools: [
      // Raydium CLMM, $2.5M liquidity
      {
        kind: 'raydium-clmm',
        address: '6truu3rZuiB9rKQg4VYC3Dt3QwV7DgwGqXrYUcrvnDDE',
      },
      // Raydium CLMM, $0.3M liquidity but the most volume ($2.9M/day)
      {
        kind: 'raydium-clmm',
        address: '4pCZCVEiYyT4efNdXUdL2tJF8VGMgiMXrZWq6FiNXhRw',
      },
      // Orca Whirlpool, $0.2M liquidity
      {
        kind: 'orca-whirlpool',
        address: 'Fae5dWVntUt6zbWu2voXxioDpMii7SqQwtsxBmoVCsHR',
      },
    ],
  },
  QQQX: {
    symbol: 'QQQx',
    mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ',
    gatePair: 'QQQX_USDT',
    pools: [
      // Raydium CLMM, $2.5M liquidity
      {
        kind: 'raydium-clmm',
        address: 'GMjGLWzvK75LPetrgAmdeXnvxc4fUuQPwJxeQqTDU1aG',
      },
      // Raydium CLMM, $0.12M liquidity (the Orca pool is only $25k)
      {
        kind: 'raydium-clmm',
        address: 'FknDV1F5n6QaA7rLmjquDjuU6wcPMNm5RYq7zWbqhpZw',
      },
    ],
  },
  GLDX: {
    symbol: 'GLDx',
    mint: 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re',
    gatePair: 'GLDX_USDT',
    pools: [
      // Raydium CLMM, $0.34M liquidity
      {
        kind: 'raydium-clmm',
        address: '78ReVNMLGRWmjtf2HmBoHUe2pRcsctXTTbxJnbhchyze',
      },
      // Orca Whirlpool, $0.14M liquidity
      {
        kind: 'orca-whirlpool',
        address: '9crUEFyBGQ1psMqpEVe4SzriVjZ2BFPpbEBEbQrvgLmx',
      },
    ],
  },
  NVDAX: {
    symbol: 'NVDAx',
    mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    gatePair: 'NVDAX_USDT',
    pools: [
      // Raydium CLMM, $2.0M liquidity
      {
        kind: 'raydium-clmm',
        address: '49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6',
      },
      // Raydium CLMM, $0.15M liquidity
      {
        kind: 'raydium-clmm',
        address: '4KqQN6u1pFKroFE2jVEhoepAMRKPcuAzWVDCgm9zRBYN',
      },
      // Orca Whirlpool, $0.13M liquidity
      {
        kind: 'orca-whirlpool',
        address: '6R4r93V5fcMzc13CL2enEepDSYcr4Qx3ptZBDwudTXCo',
      },
    ],
  },
} as const satisfies Record<string, XStockSpec>

const ALL_POOL_ADDRESSES: string[] = Array.from(
  new Set(
    Object.values(XSTOCK_SPECS).flatMap((spec) =>
      spec.pools.map((pool) => pool.address)
    )
  )
)

type PoolSnapshot = Map<string, SolanaAccount | null>

let sharedSnapshot: {
  startedAt: number
  promise: Promise<PoolSnapshot>
} | null = null

const fetchPoolSnapshot = (): Promise<PoolSnapshot> => {
  const now = Date.now()
  if (sharedSnapshot && now - sharedSnapshot.startedAt < POOL_SNAPSHOT_SHARE_MS)
    return sharedSnapshot.promise
  const promise = getMultipleAccounts(
    ALL_POOL_ADDRESSES,
    FETCH_TIMEOUT_MS
  ).then(({ accounts }) => {
    const snapshot: PoolSnapshot = new Map()
    ALL_POOL_ADDRESSES.forEach((address, i) =>
      snapshot.set(address, accounts[i] ?? null)
    )
    return snapshot
  })
  sharedSnapshot = { startedAt: now, promise }
  return promise
}

const fetchJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

type XStockSource = {
  name: string
  fetchPrice: () => Promise<number>
}

const buildSources = (spec: XStockSpec): XStockSource[] => [
  ...spec.pools.map((pool) => ({
    name: `${pool.kind}:${pool.address.slice(0, 6)}`,
    fetchPrice: async () => {
      const account = (await fetchPoolSnapshot()).get(pool.address)
      if (!account) throw new Error('no account at pool address')
      return readPoolSpotPrice({
        kind: pool.kind,
        owner: account.owner,
        data: account.data,
        baseMint: spec.mint,
        quoteMint: USDC_MINT,
        baseDecimals: XSTOCK_DECIMALS,
        quoteDecimals: USDC_DECIMALS,
      })
    },
  })),
  {
    name: 'gate',
    fetchPrice: async () =>
      readGateTickerMid(
        await fetchJson(
          `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${spec.gatePair}`
        )
      ),
  },
]

export const fetchXStockUsdPrice = async (
  spec: XStockSpec
): Promise<{ ts: number; price: number } | null> => {
  const sources = buildSources(spec)
  const results = await Promise.allSettled(
    sources.map(async (s) => {
      const price = await s.fetchPrice()
      if (!Number.isFinite(price) || price <= 0)
        throw new Error(`${s.name}: bad price ${price}`)
      return price
    })
  )
  const quotes: { source: string; price: number }[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled')
      quotes.push({ source: sources[i].name, price: r.value })
    else log(`[xstocks-price] ${spec.symbol} ${sources[i].name}: ${r.reason}`)
  })

  if (quotes.length < 2) {
    log.error(
      `[xstocks-price] ${spec.symbol}: only ${quotes.length}/${sources.length} sources responded — skipping point`
    )
    return null
  }

  const price = getConsensusMedian(
    quotes.map((quote) => quote.price),
    MAX_SOURCE_DIVERGENCE_FRAC
  )
  if (price == null) {
    log.error(
      `[xstocks-price] ${spec.symbol}: no venue pair agreed within ${
        MAX_SOURCE_DIVERGENCE_FRAC * 100
      }% (${quotes
        .map((quote) => `${quote.source}=${quote.price}`)
        .join(', ')}) — skipping point`
    )
    return null
  }
  return { ts: Date.now(), price }
}
