import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampCamera,
  gestureCamera,
  INITIAL_CAMERA,
  mapViewport,
  zoomCamera,
} from './map-camera'

const desktop = mapViewport(960, 600)

test('wheel zoom keeps the map location under the cursor', () => {
  const camera = { k: 2, x: -400, y: -200 }
  const cursor = { x: 700, y: 450 }
  const result = zoomCamera(camera, 1.5, cursor, desktop)
  assert.equal(
    ((cursor.x - camera.x) / camera.k) * result.k + result.x,
    cursor.x
  )
  assert.equal(
    ((cursor.y - camera.y) / camera.k) * result.k + result.y,
    cursor.y
  )
  assert.deepEqual(zoomCamera(result, 1 / 1.5, cursor, desktop), camera)
})

test('wheel zoom stops at its limits and returns to the overview', () => {
  const cursor = { x: 785, y: 496 }
  const zoomed = zoomCamera(INITIAL_CAMERA, 20, cursor, desktop)
  assert.equal(zoomed.k, 6)
  assert.deepEqual(zoomCamera(zoomed, 2, cursor, desktop), zoomed)
  assert.deepEqual(zoomCamera(zoomed, 0.01, cursor, desktop), INITIAL_CAMERA)
})

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

test('pinching back to the overview retains the pinch position', () => {
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
  assert.deepEqual(result, { k: 1, x: 0, y: 50 })
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
    x: 480,
    y: -1500,
  })
})

test('portrait maps use the full viewport rather than clipping to a short strip', () => {
  const portrait = mapViewport(360, 600)
  assert.deepEqual(portrait, { x: 0, y: 0, width: 960, height: 1600 })
  assert.deepEqual(clampCamera(INITIAL_CAMERA, portrait), INITIAL_CAMERA)
  // Even when the content fits, it can move aside while retaining half of
  // the map in the viewport.
  assert.deepEqual(clampCamera({ k: 2, x: -480, y: -900 }, portrait), {
    k: 2,
    x: -480,
    y: -600,
  })
  // At 3x the content exceeds the screen and can pan through its full height.
  assert.deepEqual(clampCamera({ k: 3, x: -960, y: -9999 }, portrait), {
    k: 3,
    x: -960,
    y: -1000,
  })
})

test('resizing keeps a panned map reachable without forcing it to recenter', () => {
  assert.deepEqual(clampCamera({ k: 1, x: -700, y: -800 }, desktop), {
    k: 1,
    x: -480,
    y: -300,
  })
  const wide = mapViewport(1200, 400)
  assert.deepEqual(clampCamera(INITIAL_CAMERA, wide), INITIAL_CAMERA)
})

test('the overview can pan until half the map is outside any edge', () => {
  assert.deepEqual(
    gestureCamera(
      INITIAL_CAMERA,
      [{ x: 480, y: 300 }],
      [{ x: 0, y: 0 }],
      desktop
    ),
    { k: 1, x: -480, y: -300 }
  )
  assert.deepEqual(clampCamera({ k: 1, x: 9999, y: 9999 }, desktop), {
    k: 1,
    x: 480,
    y: 300,
  })
})

test('wide layouts allow moving the map past the viewport edge for a popup', () => {
  const wide = mapViewport(1200, 400)
  assert.deepEqual(clampCamera({ k: 1, x: -900, y: 0 }, wide), {
    k: 1,
    x: -900,
    y: 0,
  })
  assert.deepEqual(clampCamera({ k: 1, x: 900, y: 0 }, wide), {
    k: 1,
    x: 900,
    y: 0,
  })
})

test('zooming out at the minimum preserves a deliberately offset map', () => {
  const camera = { k: 1, x: -400, y: 100 }
  assert.deepEqual(zoomCamera(camera, 0.7, { x: 700, y: 450 }, desktop), camera)
})
