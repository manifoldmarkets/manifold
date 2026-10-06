import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampRaceCard, placeRaceCard } from './race-card-position'

const bounds = { left: 250, right: 1400, top: 8, bottom: 992 }
const size = { width: 345, height: 130 }

test('native rectangle measurements with prototype getters keep their width', () => {
  class Rect {
    get width() {
      return 345
    }
    get height() {
      return 130
    }
  }
  assert.deepEqual(placeRaceCard({ x: 700, y: 300 }, new Rect(), bounds), {
    x: 716,
    y: 316,
  })
})

test('hover cards follow the cursor with a gap for clicking the map', () => {
  assert.deepEqual(placeRaceCard({ x: 700, y: 300 }, size, bounds), {
    x: 716,
    y: 316,
  })
  assert.deepEqual(placeRaceCard({ x: 710, y: 320 }, size, bounds), {
    x: 726,
    y: 336,
  })
})

test('cards flip to the left near the right edge', () => {
  const result = placeRaceCard({ x: 1300, y: 300 }, size, bounds)
  assert.deepEqual(result, { x: 939, y: 316 })
  assert.ok(result.x + size.width < 1300)
})

test('previews reserve room to open betting controls in the same place', () => {
  const preview = placeRaceCard({ x: 700, y: 950 }, size, bounds)
  assert.deepEqual(preview, { x: 716, y: 772 })
  assert.deepEqual(
    clampRaceCard(preview, { ...size, height: 220 }, bounds),
    preview
  )
})

test('dragging and window resizing keep the card reachable', () => {
  assert.deepEqual(clampRaceCard({ x: -200, y: -100 }, size, bounds), {
    x: 250,
    y: 8,
  })
  assert.deepEqual(clampRaceCard({ x: 1600, y: 1000 }, size, bounds), {
    x: 1055,
    y: 862,
  })
})

test('switching to a taller card keeps its position when it still fits', () => {
  const pinned = { x: 500, y: 400 }
  assert.deepEqual(
    clampRaceCard(pinned, { ...size, height: 400 }, bounds),
    pinned
  )
})
