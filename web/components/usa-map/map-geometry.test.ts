import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitCamera, INITIAL_CAMERA, mapViewport } from './map-camera'
import {
  firstShape,
  nextShape,
  pathBounds,
  placeHexLabel,
  unionBounds,
} from './map-geometry'

test('path bounds cover every point of an absolute path', () => {
  assert.deepEqual(pathBounds('M10,20L30,5L25.5,40Z'), {
    x0: 10,
    y0: 5,
    x1: 30,
    y1: 40,
  })
  assert.deepEqual(pathBounds('M-1.5,2L3e1,4ZM5,6L7,8Z'), {
    x0: -1.5,
    y0: 2,
    x1: 30,
    y1: 8,
  })
  assert.equal(pathBounds(''), undefined)
  assert.deepEqual(
    unionBounds([
      { x0: 0, y0: 0, x1: 1, y1: 1 },
      undefined,
      { x0: -2, y0: 3, x1: 4, y1: 5 },
    ]),
    { x0: -2, y0: 0, x1: 4, y1: 5 }
  )
  assert.equal(unionBounds([]), undefined)
})

test('fitting a small district centers and zooms it', () => {
  const viewport = mapViewport(960, 600)
  const bounds = { x0: 600, y0: 400, x1: 620, y1: 410 }
  const camera = fitCamera(bounds, viewport)
  assert.equal(camera.k, 6)
  const center = { x: 610 * camera.k + camera.x, y: 405 * camera.k + camera.y }
  assert.ok(Math.abs(center.x - 480) < 1e-9)
  assert.ok(Math.abs(center.y - 300) < 1e-9)
  // The whole country stays at the overview.
  assert.deepEqual(
    fitCamera({ x0: 0, y0: 0, x1: 960, y1: 600 }, viewport),
    INITIAL_CAMERA
  )
  assert.equal(fitCamera(bounds, viewport, { maxZoom: 3 }).k, 3)
})

const grid = [
  { id: 'a', center: { x: 0, y: 0 } },
  { id: 'b', center: { x: 10, y: 0 } },
  { id: 'c', center: { x: 0, y: 10 } },
  { id: 'd', center: { x: 10, y: 10 } },
  { id: 'far', center: { x: 100, y: 1 } },
]

test('arrow keys move to the nearest shape in that direction', () => {
  assert.equal(nextShape({ x: 0, y: 0 }, grid, 'ArrowRight'), 'b')
  assert.equal(nextShape({ x: 0, y: 0 }, grid, 'ArrowDown'), 'c')
  assert.equal(nextShape({ x: 10, y: 10 }, grid, 'ArrowUp'), 'b')
  assert.equal(nextShape({ x: 10, y: 10 }, grid, 'ArrowLeft'), 'c')
  assert.equal(nextShape({ x: 10, y: 0 }, grid, 'ArrowRight'), 'far')
  // Nothing beyond the edge.
  assert.equal(nextShape({ x: 0, y: 0 }, grid, 'ArrowLeft'), undefined)
  assert.equal(nextShape({ x: 0, y: 0 }, grid, 'ArrowUp'), undefined)
  assert.equal(firstShape(grid), 'a')
  assert.equal(firstShape([]), undefined)
})

test('cartogram labels avoid other states’ hexes', () => {
  const own = [{ x: 100, y: 100 }]
  // Nothing nearby: above the top hex.
  const free = placeHexLabel(own, [{ x: 300, y: 300 }], 10, 'RI')
  assert.equal(free.anchor, 'middle')
  assert.ok(free.y < 100)
  // A neighbor directly above pushes the label below.
  const below = placeHexLabel(own, [{ x: 100, y: 85 }], 10, 'RI')
  assert.ok(below.y > 100)
  // Boxed in above and below: beside the group.
  const beside = placeHexLabel(
    own,
    [
      { x: 100, y: 85 },
      { x: 100, y: 118 },
      { x: 80, y: 100 },
    ],
    10,
    'RI'
  )
  assert.equal(beside.anchor, 'start')
  assert.ok(beside.x > 100)
})
