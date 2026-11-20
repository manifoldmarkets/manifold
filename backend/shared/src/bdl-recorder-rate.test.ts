import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import {
  createRecorderSlotGate,
  maxPaidRecorderRate,
} from '../../scripts/bdl-recorder/rate'

const initial = Date.UTC(2026, 0, 1)
let root: string
let state: string
beforeEach(async () => {
  root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'bdl-rate-test-'))
  state = join(root, 'rate')
})
afterEach(async () => {
  const target = await fs.realpath(root)
  if (
    dirname(target) !== (await fs.realpath(tmpdir())) ||
    !basename(target).startsWith('bdl-rate-test-')
  )
    throw new Error('Unexpected test directory')
  await fs.rm(target, { recursive: true })
})

function worker(start = initial) {
  let time = start
  const clock = {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms
    },
  }
  const acquire = createRecorderSlotGate(state, clock)
  return async (rate: number) => {
    await acquire(rate)
    return time - initial
  }
}

it('serializes independent callers racing to initialize and consume the same slot', async () => {
  const n = 10
  let now = initial
  let wake: (() => void) | undefined
  const waiting: Array<() => void> = []
  const times: number[] = []
  const errors: unknown[] = []
  const signal = () => {
    wake?.()
    wake = undefined
  }
  const clock = {
    now: () => now,
    sleep: (_ms: number) =>
      new Promise<void>((resolve) => {
        waiting.push(resolve)
        signal()
      }),
  }
  const workers = Array.from({ length: n }, () =>
    createRecorderSlotGate(
      state,
      clock
    )(3)
      .then(() => {
        times.push(now - initial)
        signal()
      })
      .catch((error) => {
        errors.push(error)
        signal()
      })
  )
  // Hold wall time fixed while each wave contends for the same slot. Advance
  // only once every worker has either returned or registered its next sleep.
  while (times.length + errors.length < n) {
    if (times.length + errors.length + waiting.length === n) {
      now += 20_000
      waiting.splice(0).forEach((resume) => resume())
    }
    await new Promise<void>((resolve) => {
      wake = resolve
    })
  }
  await Promise.all(workers)
  expect(errors).toEqual([])
  expect(times).toEqual(Array.from({ length: n }, (_, i) => i * 20_000))
  expect((await fs.readdir(state)).sort()).toEqual(['sequence', 'slot-10.json'])
})

it('recovers from a process exiting immediately after a claim and respects the slower rate', async () => {
  expect(await worker()(3)).toBe(0)
  // A new process starts with no in-memory state ten seconds later.
  expect(await worker(initial + 10_000)(maxPaidRecorderRate)).toBe(20_000)
  expect(await worker(initial + 20_001)(1)).toBe(80_000)
  expect(await worker(initial + 81_000)(maxPaidRecorderRate)).toBe(140_000)
})

it('finishes a published slot after its process crashes before advancing the cursor', async () => {
  await fs.mkdir(state)
  await fs.writeFile(join(state, 'sequence'), '')
  await fs.writeFile(
    join(state, 'slot-1.json'),
    JSON.stringify({ at: initial, interval: 20_000 })
  )
  expect(await worker()(3)).toBe(20_000)
  expect(await fs.readdir(state)).toContain('slot-2.json')
})

it('rejects invalid rates or corrupted state without resetting the budget', async () => {
  for (const n of [0, -1, NaN, Infinity, 501, Number.MIN_VALUE])
    await expect(worker()(n)).rejects.toThrow('Invalid recorder rate')
  await fs.mkdir(state)
  await fs.writeFile(join(state, 'sequence'), Buffer.alloc(1))
  await fs.writeFile(
    join(state, 'slot-1.json'),
    JSON.stringify({ at: 'bad', interval: 1000 })
  )
  await expect(worker()(3)).rejects.toThrow('Invalid BDL recorder rate state')
  expect((await fs.readdir(state)).sort()).toEqual(['sequence', 'slot-1.json'])
})
