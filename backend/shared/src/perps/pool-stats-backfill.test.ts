import {
  calculatePerpHouseBackfill,
  PerpHouseBackfillInput,
} from './pool-stats-backfill'

const input = (): PerpHouseBackfillInput => ({
  positions: [
    {
      contract_id: 'c',
      user_id: 'u',
      direction: 'long',
      size: 200,
      cost_basis: 100,
      original_cost_basis: 100,
      taker_fee_cost_basis: 0,
      entry_price: 100,
      leverage: 2,
      liquidation_price: 50,
      opened_time: '2026-08-01T12:00:00Z',
      updated_time: '2026-08-01T12:00:00Z',
    },
  ],
  events: [
    {
      id: 1,
      contract_id: 'c',
      user_id: 'u',
      event_type: 'open',
      ts: '2026-08-01T12:00:00Z',
      applied_ts: '2026-08-01T12:00:00Z',
      oracle_price: 100,
      size_delta: 200,
      cost_basis_delta: 100,
      original_cost_basis_delta: 100,
      direction: 'long',
      leverage: 2,
      data: { entryPrice: 100 },
    },
  ],
  snapshots: [
    {
      hour: '2026-08-01T13:00:00Z',
      cutoff: '2026-08-01T13:00:00.001Z',
      oracle_price: 110,
    },
  ],
})

it('reconstructs trader claims at the recorded mark', () => {
  expect(calculatePerpHouseBackfill(input())[0].marked_position_value).toBe(120)
})

it('does not turn one un-reconstructable trader into zero liability', () => {
  const data = input()
  data.positions.push({
    ...data.positions[0],
    user_id: 'missing',
    opened_time: '2026-08-01T14:00:00Z',
  })
  expect(calculatePerpHouseBackfill(data)[0].marked_position_value).toBeNull()
})

it('includes closed traders and reconstructs before their exit', () => {
  const data = input()
  data.positions = []
  data.events.push({
    ...data.events[0],
    id: 2,
    event_type: 'close',
    ts: '2026-08-01T14:00:00Z',
    applied_ts: '2026-08-01T14:00:00Z',
    size_delta: -200,
    cost_basis_delta: -100,
    original_cost_basis_delta: -100,
    data: { entryPrice: 100, payout: 120 },
  })
  expect(calculatePerpHouseBackfill(data)[0].marked_position_value).toBe(120)
})

it('uses application time for delayed funding and accounts for its changed claim', () => {
  const data = input()
  data.positions[0].size = 220
  data.positions[0].cost_basis = 110
  data.events.push({
    ...data.events[0],
    id: 2,
    event_type: 'funding',
    ts: '2026-08-01T12:30:00Z',
    applied_ts: '2026-08-01T14:00:00Z',
    size_delta: 20,
    cost_basis_delta: 10,
    original_cost_basis_delta: 0,
    data: {},
  })
  expect(calculatePerpHouseBackfill(data)[0].marked_position_value).toBeCloseTo(
    120
  )
  data.snapshots[0].cutoff = '2026-08-01T14:00:00.001Z'
  expect(calculatePerpHouseBackfill(data)[0].marked_position_value).toBeCloseTo(
    132
  )
})

it('preserves newer reconstructable values when an older event is inconsistent', () => {
  const data = input()
  data.events[0].event_type = 'add'
  data.snapshots.unshift({
    hour: '2026-08-01T11:00:00Z',
    cutoff: '2026-08-01T11:00:00Z',
    oracle_price: 100,
  })
  expect(
    calculatePerpHouseBackfill(data).map((p) => p.marked_position_value)
  ).toEqual([null, 120])
})
