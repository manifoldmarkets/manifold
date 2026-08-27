import { getConsensusMedian } from 'common/perps/oracle'
import { PoolKind, readPoolSpotPrice } from 'common/perps/solana-pools'

import { SolanaAccount, getMultipleAccounts } from './solana-rpc'
import { log } from './utils'

// USD prices for tokenized equities (xStocks by Backed Finance), composited
// across the on-chain pools where the tokens actually trade. Same validation
// stance as btc-price.ts: the oracle point is a median gated on cross-pool
// agreement, so one pool being drained, out of range, or wicked by a thin
// print can't move the feed.
//
// Sources are Solana pools only, read directly from account state (see
// common/perps/solana-pools.ts). That is where the volume is — the main
// Raydium pool alone did 5-15x any CEX book's daily turnover on every token
// when probed 2026-08-27 — and it is where the issuer's mint/redeem arbitrage
// pins the token to NAV. Each token lists its two or three deepest USDC
// pools; they are separate liquidity and separate LPs, so they are separate
// votes, and all of them arrive in ONE RPC call per tick regardless of how
// many tokens there are. Pool state is public chain data: nobody licenses it
// and no terms govern reading it, which is the whole reason it is the only
// kind of source left here.
//
// Dropped, all on 2026-08-27:
//   - Jupiter: an aggregator over the same pools, keyless-limited to
//     30 req/min, and keyed access means a licence.
//   - MEXC: its user agreement (cl. 17(d)) prohibits "trading services that
//     make use of MEXC quotes" without written consent, (cl. 17(f)) bars
//     automated access, and lists the US as a prohibited jurisdiction.
//   - Gate: its user agreement prohibits commercial use of its data.
// The scaffolding in this file deliberately still treats a source as a
// generic {name, fetchPrice} so a non-chain vote can be added back if a
// venue with usable terms ever lists these tokens.
//
// Quote currency: every pool here quotes in USDC, so the feed is denominated
// in USDC, not USD. There is no longer a USDT/USD-quoted venue to split from
// in a stablecoin depeg; a USDC depeg would move all four feeds together and
// look like the equities moving. Accepted for now: it is a rare, global,
// loudly-reported event, and the alternative was a venue we cannot use.
//
// Units: pools trade the RAW token. xStocks pay dividends by scaling holder
// balances (Token-2022 scaled-ui-amount), so the raw token drifts above the
// underlying ETF by the accrued multiplier; that is the instrument this perp
// tracks and it is the same unit on every source here, so nothing needs
// reconciling. (Jupiter's per-SCALED-unit price was the one source that
// needed it; it is gone.)

// Must stay comfortably under the oracle tick interval (ORACLE_TICK_PERIOD_MS,
// 2s — not importable here, since scheduler depends on shared and not the
// reverse). Same reasoning as btc-price.ts: dispatch skips a feed while its
// previous run is in flight, so an RPC node that hangs to a long timeout
// costs multiple ticks, and bounding it below the tick means a slow node
// costs this tick only (and solana-rpc.ts moves on to the next endpoint on
// the next one). The public node measured 0.3-1.1s round-trip from outside
// GCP; if `[solana-rpc] ... TimeoutError` turns out to be chronic from prod
// egress, put a keyed provider first in SOLANA_RPC_URLS before raising this.
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
  /** Gate spot pair. NOT a live source (Gate's terms prohibit commercial use
   * of its data, so it was removed from the feed on 2026-08-27); referenced
   * only by backend/scripts/backfill-xstocks-oracle.ts, which seeded history
   * from Gate candles before that and should be re-pointed or retired before
   * it is run again. */
  gatePair: string
  /** USDC pools, deepest first. Two is the floor — getConsensusMedian needs
   * two agreeing quotes — so a two-pool token skips the tick whenever either
   * pool fails to read. */
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

type XStockSource = {
  name: string
  fetchPrice: () => Promise<number>
}

const buildSources = (spec: XStockSpec): XStockSource[] =>
  spec.pools.map((pool) => ({
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
  }))

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
      `[xstocks-price] ${spec.symbol}: no pool pair agreed within ${
        MAX_SOURCE_DIVERGENCE_FRAC * 100
      }% (${quotes
        .map((quote) => `${quote.source}=${quote.price}`)
        .join(', ')}) — skipping point`
    )
    return null
  }
  return { ts: Date.now(), price }
}
