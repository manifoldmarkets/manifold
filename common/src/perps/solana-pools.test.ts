import {
  POOL_PROGRAM_IDS,
  decodeOrcaWhirlpool,
  decodeRaydiumClmmPool,
  readPoolSpotPrice,
  toBase58,
} from './solana-pools'

// Fixtures are real pool accounts captured from mainnet at slot 441977650
// (2026-08-27, getMultipleAccounts base64), so the byte offsets are tested
// against what the programs actually write, not against a hand-built blob.
// Reference prices were computed independently from the same bytes.

const SPYX_MINT = 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W'
const GLDX_MINT = 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const fromBase64 = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'))

// Raydium CLMM SPYx/USDC pool 6truu3rZuiB9rKQg4VYC3Dt3QwV7DgwGqXrYUcrvnDDE
const spyxRaydium = fromBase64(
  '9+3j9dfD3kb/vwMkKhXOGC0+xLadlmOwEYhmCdTRCky/7YydGycrB2maWGtHMuSwc0WfMv/p' +
    'SauzqrA7VebI7n+CkzvwJHfvHgfo3CzeeyOg10P48SdrZX2KnuoGlQumeo0wM8U8TN5Pxvp6' +
    '877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWGuDGWQFLOhCNwBfFREj/N3+/YuXMSGQvOq' +
    'cxhzKAc5GyE+Pk07YduZaXMpkYelW6CRxLEl5Fd+rjPN0OzkvDpu6M6zEb0fSybIaaLsyppT' +
    'mQGsciFfKewmpvboW8S0F5QIBgoAEpTZAPACAAAAAAAAAAAAAAnXyh8aojDIAgAAAAAAAADw' +
    'TwAAAAAAAG0otxhC8DAAAAAAAAAAAAASKP0FxUpkAQAAAAAAAAAAaLcBAAAAAAAcmAYAAAAA' +
    'AI/x13FRAgAAAAAAAAAAAACS/AIT7w8AAAAAAAAAAAAANvbsctIQAAAAAAAAAAAAAOjsvahw' +
    'AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACaWGtHMuSwc0WfMv/pSauzqrA7VebI' +
    '7n+CkzvwJHfvHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmlhrRzLksHNFnzL/6Umr' +
    's6qwO1XmyO5/gpM78CR37x4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJpYa0cy5LBz' +
    'RZ8y/+lJq7OqsDtV5sjuf4KTO/Akd+8eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHj/' +
    '/w2EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAN/+dfwAAAADMB1RRAAAAAGCxD54DAAAA6FAlWwIAAAAaYAMAAAAAAKwKLAAAAAAA' +
    'AAAAAAAAAAD/AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
)
const SPYX_RAYDIUM_PRICE = 773.9479954937713

// Orca Whirlpool SPYx/USDC pool Fae5dWVntUt6zbWu2voXxioDpMii7SqQwtsxBmoVCsHR
const spyxOrca = fromBase64(
  'P5XRDOGAYwkT5EH4ORPKaLBjT7Al/eqohzfoQRDRJV41ezN33e4czf4CAAMEyAAUBflNvteB' +
    'AAAAAAAAAAAAAACYAxf8HQl4yAIAAAAAAAAA+E8AAECwBQAAAAAAW0QvAAAAAAAH6Nws3nsj' +
    'oNdD+PEna2V9ip7qBpULpnqNMDPFPEzeT8sWZvGU8EWl60d8IuqOuVajlFID4eE2xSkTGyP6' +
    'g1W+6bt+HQ9LiAAAAAAAAAAAAMb6evO+2606PWXzaqvJdDGxu+TC0vbg5HymAgNFL11hQPdf' +
    'SbtVuKX5wrch3jV0AXyLzsw4iOG7GN1m/uizMYbSZ4Ahjz+uAwAAAAAAAAAATniPagAAAAAM' +
    'ANCv64YU2n8Zq6AtQPGMaSWF9lAg387T1eX5qcDE4bIxhzYxtusigkDlpWr9kSzLxFWWeO3P' +
    '7vYLFRWUtv8Pui6/LwKaI7GKR1R798LZ7CubYjLuw+NoR9dh+omDPGYAAAAAAAAAAAAAAAAA' +
    'AAAAol9x/rnrRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAA='
)
const SPYX_ORCA_PRICE = 774.5543181742219

// Raydium CLMM GLDx/USDC pool 78ReVNMLGRWmjtf2HmBoHUe2pRcsctXTTbxJnbhchyze
const gldxRaydium = fromBase64(
  '9+3j9dfD3kb+vwMkKhXOGC0+xLadlmOwEYhmCdTRCky/7YydGycrB2lfSR9kH09rcIBNUqHd' +
    'pG8vYrmkrdQqK1tFFZn2iI330Qfo/t/2AKseXYSfqQl4Yg3OmTe46KQONBTcYv7ZsAZXxvp6' +
    '877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWEGD1k2fp98Dp30T82g5H7aZjUq6ri+c1Sl' +
    'hF7/G/4PMGqgimBZnRqWR5ppY0Z9gDxmOMuLnRfgrAYXhzGgTRXMuD1c+X+dTZBIWUTB2EYS' +
    'o3HKhWMbmLfJHzYsaUSWcA8IBgoAYX+gSAwBAAAAAAAAAAAAAEDNlvxGk/cOAgAAAAAAAABn' +
    'OAAAAAAAAMbPsVP0bakAAAAAAAAAAABUQTj3QAfOAgAAAAAAAAAASUMOAAAAAADsWTkAAAAA' +
    'AJEz0ReVAAAAAAAAAAAAAACFF0HRjAIAAAAAAAAAAAAAE6Y6woECAAAAAAAAAAAAABrqIFSS' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABfSR9kH09rcIBNUqHdpG8vYrmkrdQq' +
    'K1tFFZn2iI330QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAX0kfZB9Pa3CATVKh3aRv' +
    'L2K5pK3UKitbRRWZ9oiN99EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAF9JH2QfT2tw' +
    'gE1Sod2kby9iuaSt1CorW0UVmfaIjffRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACP7/' +
    'DgAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAijMQIAAAAACfL/MYAAAAAF+HAYoAAAAAGLIcbQAAAAAT8Q0AAAAAAEbFNAAAAAAA' +
    'AAAAAAAAAAD/AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
)
const GLDX_RAYDIUM_PRICE = 423.7278976766623

const RAYDIUM = POOL_PROGRAM_IDS['raydium-clmm']
const ORCA = POOL_PROGRAM_IDS['orca-whirlpool']

const spyxInput = {
  baseMint: SPYX_MINT,
  quoteMint: USDC_MINT,
  baseDecimals: 8,
  quoteDecimals: 6,
}

const raydiumSpyx = (data: Uint8Array, overrides = {}) =>
  readPoolSpotPrice({
    ...spyxInput,
    kind: 'raydium-clmm',
    owner: RAYDIUM,
    data,
    ...overrides,
  })

describe('decodeRaydiumClmmPool', () => {
  it('reads mints, decimals, liquidity, sqrt price and tick from a live account', () => {
    const pool = decodeRaydiumClmmPool(spyxRaydium)
    expect(pool).not.toBeNull()
    expect(pool!.mint0).toBe(SPYX_MINT)
    expect(pool!.mint1).toBe(USDC_MINT)
    expect(pool!.decimals0).toBe(8)
    expect(pool!.decimals1).toBe(6)
    expect(pool!.liquidity).toBe(3229829665810)
    // 51318695986973038345, scaled to a literal that is exact as a double
    expect(pool!.sqrtPriceX64 / 1e10).toBeCloseTo(5131869598.6973, 3)
    expect(pool!.tickCurrent).toBe(20464)
  })

  it('returns null for data too short to hold the price fields', () => {
    expect(decodeRaydiumClmmPool(spyxRaydium.subarray(0, 272))).toBeNull()
    expect(decodeRaydiumClmmPool(new Uint8Array(0))).toBeNull()
  })
})

describe('decodeOrcaWhirlpool', () => {
  it('reads mints, liquidity, sqrt price and tick from a live account', () => {
    const pool = decodeOrcaWhirlpool(spyxOrca)
    expect(pool).not.toBeNull()
    expect(pool!.mint0).toBe(SPYX_MINT)
    expect(pool!.mint1).toBe(USDC_MINT)
    expect(pool!.decimals0).toBeUndefined()
    expect(pool!.liquidity).toBe(557670354425)
    // 51338793976598037400, scaled to a literal that is exact as a double
    expect(pool!.sqrtPriceX64 / 1e10).toBeCloseTo(5133879397.6598, 3)
    expect(pool!.tickCurrent).toBe(20472)
  })

  it('returns null for data too short to hold both mints', () => {
    expect(decodeOrcaWhirlpool(spyxOrca.subarray(0, 212))).toBeNull()
  })
})

describe('readPoolSpotPrice', () => {
  it('prices SPYx in USDC from a Raydium pool', () => {
    expect(raydiumSpyx(spyxRaydium)).toBeCloseTo(SPYX_RAYDIUM_PRICE, 6)
  })

  it('prices SPYx in USDC from an Orca pool', () => {
    expect(
      readPoolSpotPrice({
        ...spyxInput,
        kind: 'orca-whirlpool',
        owner: ORCA,
        data: spyxOrca,
      })
    ).toBeCloseTo(SPYX_ORCA_PRICE, 6)
  })

  it('prices GLDx in USDC from a Raydium pool', () => {
    expect(
      readPoolSpotPrice({
        ...spyxInput,
        baseMint: GLDX_MINT,
        kind: 'raydium-clmm',
        owner: RAYDIUM,
        data: gldxRaydium,
      })
    ).toBeCloseTo(GLDX_RAYDIUM_PRICE, 6)
  })

  it('agrees with the pool tick to within one tick', () => {
    // Independent check of the same fact: 1.0001^tick is the price floor of
    // the current tick, so the decoded price must sit within one tick above.
    const pool = decodeRaydiumClmmPool(spyxRaydium)!
    const tickPrice = Math.pow(1.0001, pool.tickCurrent) * 100
    const price = raydiumSpyx(spyxRaydium)
    expect(price / tickPrice).toBeGreaterThanOrEqual(0.9999)
    expect(price / tickPrice).toBeLessThan(1.0002)
  })

  it("inverts when the requested base is the pool's token 1", () => {
    const inverted = readPoolSpotPrice({
      kind: 'raydium-clmm',
      owner: RAYDIUM,
      data: spyxRaydium,
      baseMint: USDC_MINT,
      quoteMint: SPYX_MINT,
      baseDecimals: 6,
      quoteDecimals: 8,
    })
    expect(inverted).toBeCloseTo(1 / SPYX_RAYDIUM_PRICE, 12)
  })

  it('fails closed when the account is not owned by the expected program', () => {
    expect(raydiumSpyx(spyxRaydium, { owner: ORCA })).toBeNaN()
    expect(
      raydiumSpyx(spyxRaydium, { owner: '11111111111111111111111111111111' })
    ).toBeNaN()
  })

  it('fails closed when the pool is not the requested pair', () => {
    expect(raydiumSpyx(spyxRaydium, { baseMint: GLDX_MINT })).toBeNaN()
    expect(raydiumSpyx(spyxRaydium, { quoteMint: GLDX_MINT })).toBeNaN()
  })

  it('fails closed when declared decimals contradict what a Raydium pool stores', () => {
    expect(raydiumSpyx(spyxRaydium, { baseDecimals: 6 })).toBeNaN()
    expect(raydiumSpyx(spyxRaydium, { quoteDecimals: 9 })).toBeNaN()
  })

  it('fails closed on a pool with no in-range liquidity', () => {
    const drained = new Uint8Array(spyxRaydium)
    drained.fill(0, 237, 253)
    expect(raydiumSpyx(drained)).toBeNaN()
  })

  it('fails closed when the sqrt price and tick cannot both be right (layout drift)', () => {
    // Corrupt the price alone so the cross-check, not the mint check, is
    // what has to catch it.
    const corrupted = new Uint8Array(spyxRaydium)
    corrupted[260] = corrupted[260] ^ 0x40 // flip a high bit of sqrt_price_x64
    expect(raydiumSpyx(corrupted)).toBeNaN()
  })

  it('fails closed when an account is read with the wrong layout', () => {
    // A Raydium account under the Orca layout: owner check passes by
    // construction here, so only the decoded contents can reject it.
    expect(
      readPoolSpotPrice({
        ...spyxInput,
        kind: 'orca-whirlpool',
        owner: ORCA,
        data: spyxRaydium,
      })
    ).toBeNaN()
  })

  it('fails closed on truncated data', () => {
    expect(raydiumSpyx(spyxRaydium.subarray(0, 200))).toBeNaN()
    expect(
      readPoolSpotPrice({
        ...spyxInput,
        kind: 'orca-whirlpool',
        owner: ORCA,
        data: spyxOrca.subarray(0, 100),
      })
    ).toBeNaN()
  })
})

describe('toBase58', () => {
  it('encodes the system program id (all zero bytes) as 32 ones', () => {
    expect(toBase58(new Uint8Array(32))).toBe(
      '11111111111111111111111111111111'
    )
  })

  it('round-trips a known public key', () => {
    // USDC mint bytes, as stored in the Raydium fixture at token_mint_1.
    expect(toBase58(spyxRaydium.subarray(105, 137))).toBe(USDC_MINT)
  })

  it('encodes the empty input as the empty string', () => {
    expect(toBase58(new Uint8Array(0))).toBe('')
  })
})
