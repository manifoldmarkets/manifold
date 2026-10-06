import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hitTargets, layoutSegments, seatPosition } from './seat-bar-layout'

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6

test('segments are proportional when none is thin', () => {
  const boxes = layoutSegments([1, 3], 402, { gap: 2 })
  assert.ok(close(boxes[0].w, 100))
  assert.ok(close(boxes[1].w, 300))
  assert.ok(close(boxes[1].x, 102))
})

test('a 1-seat segment gets a visible width taken from the big ones', () => {
  // The House bar: CA-40 is one seat of 435 on a 360px phone bar.
  const counts = [9, 173, 34, 2, 5, 1, 8, 13, 59, 122, 9, 1]
  const width = 360
  const boxes = layoutSegments(counts, width, { min: 6, gap: 2 })
  assert.ok(boxes.every((b) => b.w >= 6 - 1e-9))
  const last = boxes[boxes.length - 1]
  assert.ok(close(last.x + last.w, width))
  // Wider segments give up more than narrower ones; order is unchanged.
  assert.ok(boxes[1].w > boxes[2].w && boxes[9].w > boxes[8].w)
  // Gaps are exactly 2px.
  for (let i = 1; i < boxes.length; i++)
    assert.ok(close(boxes[i].x - (boxes[i - 1].x + boxes[i - 1].w), 2))
})

test('the bar always spans the width, even when the floor cannot be met', () => {
  const boxes = layoutSegments([1, 1, 1, 1000], 20, { min: 6, gap: 2 })
  const last = boxes[boxes.length - 1]
  assert.ok(close(last.x + last.w, 20))
  assert.ok(boxes.every((b) => b.w > 0))
  assert.deepEqual(layoutSegments([], 100), [])
  assert.deepEqual(layoutSegments([1], 0), [])
})

test('thresholds sit at their seat inside the laid-out bar', () => {
  const counts = [50, 50]
  const boxes = layoutSegments(counts, 202, { gap: 2 })
  assert.ok(close(seatPosition(counts, boxes, 50)!, 100))
  assert.ok(close(seatPosition(counts, boxes, 75)!, 152))
  assert.ok(close(seatPosition(counts, boxes, 100)!, 202))
  assert.equal(seatPosition([], [], 1), undefined)
})

test('tap targets reach 24px without overlapping thin neighbors', () => {
  const counts = [9, 173, 34, 10, 5, 8, 14, 59, 122, 1]
  const width = 358
  const boxes = layoutSegments(counts, width, { min: 6, gap: 2 })
  const targets = hitTargets(boxes, width)
  targets.forEach((t, i) => {
    // Every target covers its own segment and stays inside the bar.
    assert.ok(t.left <= boxes[i].x + 1e-9)
    assert.ok(t.left + t.width >= boxes[i].x + boxes[i].w - 1e-9)
    assert.ok(t.left >= 0 && t.left + t.width <= width + 1e-9)
  })
  // The toss-up center (5 seats) is inside its own target only, not the
  // neighboring thin segments' targets.
  const tossup = boxes[4].x + boxes[4].w / 2
  for (const j of [3, 5])
    assert.ok(
      tossup < targets[j].left || tossup > targets[j].left + targets[j].width,
      `segment ${j}`
    )
  // A thin segment at the end of the bar still gets a 24px target.
  const last = targets[targets.length - 1]
  assert.ok(close(last.left + last.width, width))
  assert.ok(close(last.width, 24))
  // Wide segments get exactly their own extent.
  assert.ok(close(targets[1].left, boxes[1].x))
  assert.ok(close(targets[1].width, boxes[1].w))
})
