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
it.each([
  ['default', []],
  ['mnx', ['--cohort=mnx']],
])(
  'audits token and backing of both cohorts with %s selected',
  async (_label, options) => {
    process.argv = ['node', 'preflight', '--phase=feeds', ...options]
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
    for (const contract of contracts) {
      expect(backing).toHaveBeenCalledWith(contract.id)
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
