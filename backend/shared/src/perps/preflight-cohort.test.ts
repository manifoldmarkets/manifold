import { SupabaseDirectClient } from '../supabase/init'
import { log } from '../utils'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { PerpContract } from 'common/contract'
jest.mock('../../../scripts/run-script', () => ({ runScript: jest.fn() }))
jest.mock('../init-admin', () => ({ getLocalEnv: () => 'DEV' }))
jest.mock('../mnx', () => ({
  fetchMnxSnapshot: jest.fn(async () => ({ feeds: {} })),
  requireMnxReady: jest.fn(() => {
    throw new Error('fixture')
  }),
}))
jest.mock('../utils', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
const args = process.argv
beforeEach(() => jest.clearAllMocks())
afterEach(() => {
  process.argv = args
})
it.each(
  ['default', 'mnx'].flatMap((cohort) =>
    ['feeds', 'unlisted', 'rollout', 'public'].map((phase) => ({
      cohort,
      phase,
    }))
  )
)(
  'audits both cohorts without membership warnings for $cohort in $phase',
  async ({ cohort, phase }) => {
    process.argv = [
      'node',
      'preflight',
      `--phase=${phase}`,
      ...(cohort === 'mnx' ? ['--cohort=mnx'] : []),
      ...(phase === 'rollout'
        ? [
            `--public-feed=${
              cohort === 'mnx' ? 'mnx-anthropic-mark' : 'btc-usd'
            }`,
          ]
        : []),
    ]
    let audit!: (pg: SupabaseDirectClient) => Promise<void>
    jest.isolateModules(() => {
      // CLI options are captured at import time; isolate each cohort's module.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      audit = require('../../../scripts/perp-launch-preflight').auditPerpLaunch
    })
    const now = Date.now()
    const contracts = ['btc-usd', 'mnx-anthropic-mark'].map(
      (feedId) =>
        ({
          id: feedId,
          slug: feedId,
          oracleFeedId: feedId,
          mechanism: 'perp',
          question: 'fixture',
          creatorId: 'fixture',
          token: 'CASH',
          oraclePrice: feedId === 'btc-usd' ? 100000 : 2104,
          oraclePriceTime: now,
          maxOraclePriceAgeMs: 5 * MINUTE_MS,
          fundingPeriodMs: HOUR_MS,
          maxLeverage: 3,
          maxFundingRate: 0.0001,
          fundingSensitivity: 1,
          poolLong: 25000,
          poolShort: 25000,
          initialSubsidy: 50000,
          createdTime: now,
        } as unknown as PerpContract)
    )
    const backing = jest.fn()
    const pg = {
      manyOrNone: jest.fn(async (sql: string) => {
        if (sql.includes('select data, token from contracts'))
          return contracts.map((data) => ({ data, token: 'CASH' }))
        return []
      }),
      oneOrNone: jest.fn(async () => null),
      one: jest.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes('from txns')) {
          backing(values?.[0])
          return { balance: 0 }
        }
        return { group_slugs: [], has_embedding: false, count: 0 }
      }),
    }
    await expect(audit(pg as unknown as SupabaseDirectClient)).rejects.toThrow(
      /preflight failed/
    )
    expect(log).toHaveBeenCalledWith(
      '[PASS] market audit scope: 2 markets inspected, including 1 from other cohorts; only launch membership/visibility expectations are scoped'
    )
    expect(log.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('other cohort')
    )
    expect(log.error).not.toHaveBeenCalledWith(
      expect.stringContaining('other-cohort')
    )
    // Membership is informational; genuine warnings still fail the later gates.
    if (phase !== 'feeds')
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('unexpected warning external-alert-policies')
      )
    for (const contract of contracts) {
      expect(backing).toHaveBeenCalledWith(contract.id)
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining(`market ${contract.slug} launch ticker`)
      )
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining(`market ${contract.slug} trading token`)
      )
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining(`market ${contract.slug} cash backing`)
      )
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`market ${contract.slug} solvency`)
      )
    }
  }
)

const partnerRow = {
  id: 'mnx-user',
  username: 'MNX',
  name: 'MNX',
  balance: 0,
  cash_balance: 0,
  spice_balance: 0,
  total_deposits: 0,
  total_cash_deposits: 0,
  created_time: '2026-01-01T00:00:00Z',
  data: {},
}

// Runs the MNX-cohort feeds audit with the partner id pinned for DEV. The
// preflight is loaded in an isolated registry, so the pin is applied by a
// mock factory on that registry's copy of the module.
const auditWithPinnedPartner = async (partnerExists: boolean) => {
  process.argv = ['node', 'preflight', '--phase=feeds', '--cohort=mnx']
  jest.doMock('./creator-accounts', () => {
    const actual = jest.requireActual('./creator-accounts')
    actual.MNX_CREATOR_IDS.DEV = 'mnx-user'
    return actual
  })
  let audit!: (pg: SupabaseDirectClient) => Promise<void>
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      audit = require('../../../scripts/perp-launch-preflight').auditPerpLaunch
    })
  } finally {
    jest.dontMock('./creator-accounts')
  }
  const now = Date.now()
  const contracts = ['btc-usd', 'mnx-anthropic-mark'].map(
    (feedId) =>
      ({
        id: feedId,
        slug: feedId,
        oracleFeedId: feedId,
        mechanism: 'perp',
        question: 'fixture',
        creatorId: 'mnx-user',
        token: 'MANA',
        oraclePrice: feedId === 'btc-usd' ? 100000 : 2104,
        oraclePriceTime: now,
        maxOraclePriceAgeMs: 5 * MINUTE_MS,
        fundingPeriodMs: HOUR_MS,
        maxLeverage: 3,
        maxFundingRate: 0.0001,
        fundingSensitivity: 1,
        poolLong: 25000,
        poolShort: 25000,
        initialSubsidy: 50000,
        createdTime: now,
      } as unknown as PerpContract)
  )
  const pg = {
    manyOrNone: jest.fn(async (sql: string) => {
      if (sql.includes('select data, token from contracts'))
        return contracts.map((data) => ({ data, token: 'MANA' }))
      return []
    }),
    oneOrNone: jest.fn(
      async (sql: string, values?: unknown[], cb?: (r: unknown) => unknown) =>
        partnerExists &&
        sql.includes('from users where id = $1') &&
        values?.[0] === 'mnx-user' &&
        cb
          ? cb(partnerRow)
          : null
    ),
    one: jest.fn(async (sql: string) =>
      sql.includes('from txns')
        ? { balance: 0 }
        : { group_slugs: [], has_embedding: false, count: 0 }
    ),
  }
  await expect(audit(pg as unknown as SupabaseDirectClient)).rejects.toThrow(
    /preflight failed/
  )
  expect(pg.oneOrNone).not.toHaveBeenCalledWith(
    expect.stringContaining('username'),
    expect.anything(),
    expect.anything()
  )
}

it('accepts the pinned MNX partner as creator of MNX-feed markets only', async () => {
  await auditWithPinnedPartner(true)
  expect(log).toHaveBeenCalledWith(
    '[PASS] creator accounts: official DEV account MxyCh2xvsFMFywwjg3Az0w4xP5B3; MNX partner account @MNX (mnx-user) may own MNX feeds'
  )
  expect(log).toHaveBeenCalledWith(
    '[PASS] market mnx-anthropic-mark launch creator: MNX partner account @MNX (mnx-user)'
  )
  expect(log).toHaveBeenCalledWith(
    '[PASS] market mnx-anthropic-mark launch title: MNX-owned display title: "fixture"'
  )
  expect(log.error).toHaveBeenCalledWith(
    expect.stringContaining('[FAIL] market btc-usd launch title:')
  )
  expect(log.error).toHaveBeenCalledWith(
    expect.stringContaining('[FAIL] market mnx-anthropic-mark launch ticker:')
  )
  expect(log.error).toHaveBeenCalledWith(
    expect.stringContaining(
      '[FAIL] market btc-usd launch creator: creator mnx-user is not an allowed creator account for btc-usd (MxyCh2xvsFMFywwjg3Az0w4xP5B3)'
    )
  )
})

it('keeps markets owned by the pinned id valid when its row cannot be resolved', async () => {
  await auditWithPinnedPartner(false)
  expect(log.warn).toHaveBeenCalledWith(
    '[WARN] creator accounts [warning-key=creator-accounts]: MNX partner account mnx-user may own MNX feeds but MNX account mnx-user does not exist in DEV'
  )
  expect(log).toHaveBeenCalledWith(
    '[PASS] market mnx-anthropic-mark launch creator: MNX partner account mnx-user'
  )
})
