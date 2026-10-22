// Spot prices decoded straight from Solana AMM pool accounts.
//
// The xStocks oracle reads the pools where these tokens actually trade, not
// an aggregator that re-serves them. Jupiter's price API was the first cut
// and was dropped on 2026-08-27: it is a middleman over exactly this pool
// state, keyless it allows 30 requests a minute (a 2s poll of four tokens is
// 120), and taking a key means accepting a licence with an attribution clause
// and no uptime commitment. Pool state is public chain data that nobody
// licenses; the only third party left is whichever RPC node serves it, and
// that is interchangeable (see backend/shared/src/solana-rpc.ts).
//
// Both concentrated-liquidity programs read here keep the Uniswap-v3 state
// shape: a Q64.64 fixed-point square root of the price of token 1 in token 0
// in RAW token units, plus the current tick. What this returns is therefore
// the pool's marginal price — where the next swap would execute — which is a
// better oracle than any venue's last trade. It is in raw units, the same
// units CEX order books trade, so the rebase/scaled-unit trap that Jupiter's
// per-scaled-unit `usdPrice` used to set does not exist on this path.
//
// Decoding is by fixed byte offset, which is how every client of these
// programs reads them (Anchor accounts with no version tag). A layout change
// after a program upgrade would therefore read garbage SILENTLY, so the
// reader cross-checks the two independent encodings of the same fact that
// both layouts carry — sqrt price and current tick — and fails closed when
// they disagree. See readPoolSpotPrice.
//
// No BigInt anywhere, on purpose: backend/shared's jest transpiles this file
// under an ES2017 target (its tsconfig), where BigInt literals do not
// compile. The u128 fields are read as doubles instead — exact for the
// liquidity zero-check and accurate to 2^-53 relative for the sqrt price,
// against a tick cross-check tolerance of 5e-4 — and base58 is the classic
// byte-array long division.

export type PoolKind = 'raydium-clmm' | 'orca-whirlpool'

/** Program that must own a pool account of each kind. Checked against the
 * RPC-reported owner before decoding, so a mistyped address (some other
 * account, a token account, a closed pool) cannot be read as a pool. */
export const POOL_PROGRAM_IDS: Record<PoolKind, string> = {
  'raydium-clmm': 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  'orca-whirlpool': 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
}

export type DecodedPool = {
  mint0: string
  mint1: string
  /** Raydium stores both mints' decimals in the pool account; Orca does not. */
  decimals0?: number
  decimals1?: number
  /** In-range liquidity (L), as a double. Zero means nothing backs the
   * current price; the magnitude is otherwise not used. */
  liquidity: number
  /** Q64.64 sqrt price as a double (2^-53 relative precision). */
  sqrtPriceX64: number
  tickCurrent: number
}

// Raydium CLMM `PoolState`
// (raydium-io/raydium-clmm, programs/amm/src/states/pool.rs), byte offsets:
//     0   8  anchor discriminator
//     8   1  bump
//     9  32  amm_config
//    41  32  owner (pool creator — NOT the program; that is the account owner)
//    73  32  token_mint_0
//   105  32  token_mint_1
//   137  32  token_vault_0
//   169  32  token_vault_1
//   201  32  observation_key
//   233   1  mint_decimals_0
//   234   1  mint_decimals_1
//   235   2  tick_spacing
//   237  16  liquidity (u128 LE)
//   253  16  sqrt_price_x64 (u128 LE)
//   269   4  tick_current (i32 LE)
const RAYDIUM_CLMM = {
  mint0: 73,
  mint1: 105,
  decimals0: 233,
  decimals1: 234,
  liquidity: 237,
  sqrtPrice: 253,
  tick: 269,
  minLength: 273,
} as const

// Orca `Whirlpool`
// (orca-so/whirlpools, programs/whirlpool/src/state/whirlpool.rs), offsets:
//     0   8  anchor discriminator
//     8  32  whirlpools_config
//    40   1  whirlpool_bump
//    41   2  tick_spacing
//    43   2  fee_tier_index_seed (was tick_spacing_seed)
//    45   2  fee_rate
//    47   2  protocol_fee_rate
//    49  16  liquidity (u128 LE)
//    65  16  sqrt_price (u128 LE)
//    81   4  tick_current_index (i32 LE)
//    85   8  protocol_fee_owed_a
//    93   8  protocol_fee_owed_b
//   101  32  token_mint_a
//   133  32  token_vault_a
//   165  16  fee_growth_global_a
//   181  32  token_mint_b
const ORCA_WHIRLPOOL = {
  liquidity: 49,
  sqrtPrice: 65,
  tick: 81,
  mint0: 101,
  mint1: 181,
  minLength: 213,
} as const

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Base58 (Bitcoin alphabet) encoding, as Solana renders public keys. Kept
 * local rather than pulled from a dependency: it is twenty lines and this
 * package has no Solana deps to share it with. Byte-array long division, so
 * it needs no BigInt (see the module note). */
export const toBase58 = (bytes: Uint8Array): string => {
  // Base-58 digits, least significant first.
  const digits: number[] = []
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 256
      digits[j] = carry % 58
      carry = Math.floor(carry / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  let leadingZeros = 0
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0)
    leadingZeros++
  let encoded = ''
  for (let i = digits.length - 1; i >= 0; i--)
    encoded += BASE58_ALPHABET[digits[i]]
  return '1'.repeat(leadingZeros) + encoded
}

const readPubkey = (data: Uint8Array, offset: number) =>
  toBase58(data.subarray(offset, offset + 32))

/** Little-endian u128 as a double. Summed most-significant byte first so the
 * rounding happens once at the low end rather than accumulating. */
const readU128LE = (data: Uint8Array, offset: number): number => {
  let value = 0
  for (let i = 15; i >= 0; i--) value = value * 256 + data[offset + i]
  return value
}

const readI32LE = (data: Uint8Array, offset: number): number =>
  new DataView(data.buffer, data.byteOffset, data.byteLength).getInt32(
    offset,
    true
  )

export const decodeRaydiumClmmPool = (data: Uint8Array): DecodedPool | null => {
  if (data.length < RAYDIUM_CLMM.minLength) return null
  return {
    mint0: readPubkey(data, RAYDIUM_CLMM.mint0),
    mint1: readPubkey(data, RAYDIUM_CLMM.mint1),
    decimals0: data[RAYDIUM_CLMM.decimals0],
    decimals1: data[RAYDIUM_CLMM.decimals1],
    liquidity: readU128LE(data, RAYDIUM_CLMM.liquidity),
    sqrtPriceX64: readU128LE(data, RAYDIUM_CLMM.sqrtPrice),
    tickCurrent: readI32LE(data, RAYDIUM_CLMM.tick),
  }
}

export const decodeOrcaWhirlpool = (data: Uint8Array): DecodedPool | null => {
  if (data.length < ORCA_WHIRLPOOL.minLength) return null
  return {
    mint0: readPubkey(data, ORCA_WHIRLPOOL.mint0),
    mint1: readPubkey(data, ORCA_WHIRLPOOL.mint1),
    liquidity: readU128LE(data, ORCA_WHIRLPOOL.liquidity),
    sqrtPriceX64: readU128LE(data, ORCA_WHIRLPOOL.sqrtPrice),
    tickCurrent: readI32LE(data, ORCA_WHIRLPOOL.tick),
  }
}

export const decodePool = (
  kind: PoolKind,
  data: Uint8Array
): DecodedPool | null =>
  kind === 'raydium-clmm'
    ? decodeRaydiumClmmPool(data)
    : decodeOrcaWhirlpool(data)

// The tick is the floor of log_1.0001(raw price), so a correctly decoded pair
// satisfies 1 <= sqrt^2 / 1.0001^tick < 1.0001. A little slack on both sides
// covers the boundary case where a swap lands exactly on a tick (both
// programs then report the tick BELOW the price) and float rounding of the
// pow. Wrong offsets miss this by orders of magnitude, which is the point.
const TICK_CHECK_MIN = 0.9995
const TICK_CHECK_MAX = 1.0006

export type PoolPriceInput = {
  kind: PoolKind
  /** Program id the RPC reports as the account's owner. */
  owner: string
  data: Uint8Array
  baseMint: string
  quoteMint: string
  baseDecimals: number
  quoteDecimals: number
}

/**
 * Marginal price of `baseMint` in `quoteMint` from a pool account, or NaN.
 *
 * NaN, never a guess, on: wrong owning program, short or unrecognised data,
 * a pool that is not exactly the (base, quote) pair in either order, declared
 * decimals that contradict what the pool stores (Raydium), zero in-range
 * liquidity, or a sqrt price / tick pair that cannot both be right. Every
 * one of those is a misconfiguration or a layout drift, and each would
 * otherwise produce a plausible-looking number in the wrong unit or for the
 * wrong instrument.
 */
export const readPoolSpotPrice = (input: PoolPriceInput): number => {
  if (input.owner !== POOL_PROGRAM_IDS[input.kind]) return Number.NaN
  const pool = decodePool(input.kind, input.data)
  if (!pool) return Number.NaN

  let baseIs0: boolean
  if (pool.mint0 === input.baseMint && pool.mint1 === input.quoteMint)
    baseIs0 = true
  else if (pool.mint0 === input.quoteMint && pool.mint1 === input.baseMint)
    baseIs0 = false
  else return Number.NaN

  const decimals0 = baseIs0 ? input.baseDecimals : input.quoteDecimals
  const decimals1 = baseIs0 ? input.quoteDecimals : input.baseDecimals
  if (pool.decimals0 != null && pool.decimals0 !== decimals0) return Number.NaN
  if (pool.decimals1 != null && pool.decimals1 !== decimals1) return Number.NaN
  if (!(pool.liquidity > 0)) return Number.NaN

  // Q64.64 -> float loses nothing that matters: the mantissa keeps 53 bits
  // of a value that only needs ~1e-9 relative precision to price a share.
  const sqrt = pool.sqrtPriceX64 / 2 ** 64
  const rawPrice1Per0 = sqrt * sqrt
  const ratioToTick = rawPrice1Per0 / Math.pow(1.0001, pool.tickCurrent)
  if (!(ratioToTick >= TICK_CHECK_MIN && ratioToTick <= TICK_CHECK_MAX))
    return Number.NaN

  const price1Per0 = rawPrice1Per0 * 10 ** (decimals0 - decimals1)
  const price = baseIs0 ? price1Per0 : 1 / price1Per0
  return Number.isFinite(price) && price > 0 ? price : Number.NaN
}
