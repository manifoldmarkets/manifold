import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampCamera,
  gestureCamera,
  INITIAL_CAMERA,
  mapViewport,
} from './map-camera'

const desktop = mapViewport(960, 600)

test('pinching keeps the touched map location under the moving midpoint', () => {
  const result = gestureCamera(
    INITIAL_CAMERA,
    [
      { x: 300, y: 250 },
      { x: 500, y: 250 },
    ],
    [
      { x: 200, y: 280 },
      { x: 600, y: 280 },
    ],
    desktop
  )
  assert.deepEqual(result, { k: 2, x: -400, y: -220 })
  assert.equal(400 * result.k + result.x, 400)
  assert.equal(250 * result.k + result.y, 280)
})

test('pinching back to the overview recenters the map', () => {
  const result = gestureCamera(
    { k: 2, x: -400, y: -200 },
    [
      { x: 100, y: 300 },
      { x: 700, y: 300 },
    ],
    [
      { x: 350, y: 300 },
      { x: 450, y: 300 },
    ],
    desktop
  )
  assert.deepEqual(result, INITIAL_CAMERA)
})

test('zoom limits do not move the pinch anchor beyond the requested scale', () => {
  const result = gestureCamera(
    { k: 5, x: -1920, y: -1200 },
    [
      { x: 430, y: 300 },
      { x: 530, y: 300 },
    ],
    [
      { x: 280, y: 300 },
      { x: 680, y: 300 },
    ],
    desktop
  )
  assert.deepEqual(result, { k: 6, x: -2400, y: -1500 })
})

test('one-finger pan after a pinch retains its zoom and respects map bounds', () => {
  const result = gestureCamera(
    { k: 3, x: -700, y: -500 },
    [{ x: 400, y: 300 }],
    [{ x: 550, y: 350 }],
    desktop
  )
  assert.deepEqual(result, { k: 3, x: -550, y: -450 })
  assert.deepEqual(clampCamera({ k: 3, x: 900, y: -9999 }, desktop), {
    k: 3,
    x: 0,
    y: -1200,
  })
})

test('portrait maps use the full viewport rather than clipping to a short strip', () => {
  const portrait = mapViewport(360, 600)
  assert.deepEqual(portrait, { x: 0, y: 0, width: 960, height: 1600 })
  assert.deepEqual(clampCamera(INITIAL_CAMERA, portrait), INITIAL_CAMERA)
  // At 2x the map is taller than the old 600-unit viewBox, but still fits
  // vertically in this screen. Keep it below the toolbar without clipping it.
  assert.deepEqual(clampCamera({ k: 2, x: -480, y: -900 }, portrait), {
    k: 2,
    x: -480,
    y: 0,
  })
  // At 3x the content exceeds the screen and can pan through its full height.
  assert.deepEqual(clampCamera({ k: 3, x: -960, y: -9999 }, portrait), {
    k: 3,
    x: -960,
    y: -200,
  })
})

test('resizing back to desktop brings a panned map back into bounds', () => {
  assert.deepEqual(
    clampCamera({ k: 1, x: -700, y: -800 }, desktop),
    INITIAL_CAMERA
  )
  const wide = mapViewport(1200, 400)
  assert.deepEqual(clampCamera(INITIAL_CAMERA, wide), INITIAL_CAMERA)
})
