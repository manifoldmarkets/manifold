import { PerpAccounting } from 'common/perps/accounting-mode'
import { PerpEvent, PerpPosition } from 'common/perps/position'
import { Row } from 'common/supabase/utils'

import {
  insertPerpEventsQuery,
  positionToRow,
  presentAccountingEpochQuery,
  rowToPosition,
  selectShadowCheckpointQuery,
  upsertRiskShadowQuery,
} from './queries'

const legacy: PerpAccounting = {
  mode: 'legacy',
  epoch: 0,
  riskPolicyMode: 'off',
}
const shadow: PerpAccounting = {
  mode: 'shadow',
  epoch: 1,
  riskPolicyMode: 'off',
}
const protectedAccounting: PerpAccounting = {
  mode: 'protected',
  epoch: 2,
  riskPolicyMode: 'off',
}

const position: PerpPosition = {
  userId: 'u',
  contractId: 'c',
  direction: 'long',
  size: 1000,
  costBasis: 100,
  reserveBasis: 90,
  originalCostBasis: 100,
  takerFeeCostBasis: 1,
  entryPrice: 50,
  leverage: 10,
  liquidationPrice: 45,
  openedTime: 1_700_000_000_000,
  updatedTime: 1_700_000_000_000,
}

const dbRow = (
  over: Partial<Row<'contract_perp_positions'>> = {}
): Row<'contract_perp_positions'> => ({
  contract_id: 'c',
  user_id: 'u',
  direction: 'long',
  size: 1000,
  cost_basis: 100,
  reserve_basis: 90,
  accounting_epoch: 2,
  original_cost_basis: 100,
  taker_fee_cost_basis: 1,
  entry_price: 50,
  leverage: 10,
  liquidation_price: 45,
  opened_time: new Date(1_700_000_000_000).toISOString(),
  updated_time: new Date(1_700_000_000_000).toISOString(),
  ...over,
})

describe('position row conversion under each accounting mode', () => {
  it('mirrors b = c on legacy and shadow writes, whatever the in-memory row says', () => {
    expect(positionToRow(position, legacy).reserve_basis).toBe(100)
    expect(positionToRow(position, legacy).accounting_epoch).toBe(0)
    expect(positionToRow(position, shadow).reserve_basis).toBe(100)
    expect(positionToRow(position, shadow).accounting_epoch).toBe(1)
  })

  it('writes the explicit b and epoch under protected accounting and refuses a row without b', () => {
    const row = positionToRow(position, protectedAccounting)
    expect(row.reserve_basis).toBe(90)
    expect(row.accounting_epoch).toBe(2)
    const { reserveBasis: _dropped, ...withoutB } = position
    void _dropped
    expect(() => positionToRow(withoutB, protectedAccounting)).toThrow(
      'no reserve basis'
    )
  })

  it('reads legacy/shadow rows as b = c regardless of the column, and protected rows as stored', () => {
    expect(rowToPosition(dbRow(), legacy).reserveBasis).toBe(100)
    expect(
      rowToPosition(dbRow({ reserve_basis: null }), legacy).reserveBasis
    ).toBe(100)
    expect(rowToPosition(dbRow(), shadow).reserveBasis).toBe(100)
    expect(rowToPosition(dbRow(), protectedAccounting).reserveBasis).toBe(90)
    expect(rowToPosition(dbRow()).reserveBasis).toBe(100)
  })

  it('fails closed on a protected row that has no b', () => {
    expect(() =>
      rowToPosition(dbRow({ reserve_basis: null }), protectedAccounting)
    ).toThrow('has no reserve basis')
  })
})

describe('event persistence stamps', () => {
  const event: PerpEvent = {
    contractId: 'c',
    userId: 'u',
    eventType: 'close',
    appliedTime: 1,
    ts: 1,
    oraclePrice: 50,
    sizeDelta: -1000,
    costBasisDelta: -100,
    reserveBasisDelta: -90,
    originalCostBasisDelta: -100,
    direction: 'long',
    leverage: 0,
  }

  it('mirrors Δb = Δc and stamps the mode/epoch on legacy and shadow events', () => {
    const sql = insertPerpEventsQuery([event], shadow)
    expect(sql).toContain("'shadow'")
    expect(sql).toMatch(/-100.*-100/)
    expect(sql).not.toContain('-90')
  })

  it('persists the stated Δb under protected accounting and refuses an event without one', () => {
    const sql = insertPerpEventsQuery([event], protectedAccounting)
    expect(sql).toContain("'protected'")
    expect(sql).toContain('-90')
    const { reserveBasisDelta: _dropped, ...withoutDelta } = event
    void _dropped
    expect(() =>
      insertPerpEventsQuery([withoutDelta], protectedAccounting)
    ).toThrow('no reserve basis delta')
  })

  it('presents the epoch as a transaction-local setting', () => {
    expect(presentAccountingEpochQuery(7)).toBe(
      "select set_config('perp.accounting_epoch', '7', true)"
    )
  })
})

describe('shadow queries', () => {
  it('selects every checkpoint column the simulator and preflight read (a missing updated_time crashed the preflight after shadow activation)', () => {
    const sql = selectShadowCheckpointQuery('c1')
    for (const column of [
      'contract_id',
      'accounting_epoch',
      'state',
      'transitions',
      'divergences',
      'last_report',
      'updated_time',
    ])
      expect(sql).toContain(column)
  })

  it('lets a newer risk-shadow evaluation win regardless of arrival order', () => {
    const sql = upsertRiskShadowQuery('c1', { kind: 'open', at: 5 })
    expect(sql).toMatch(/on conflict \(contract_id\) do update/)
    expect(sql).toMatch(/excluded\.data->>'at'/)
    expect(sql).toMatch(/>=/)
  })
})
