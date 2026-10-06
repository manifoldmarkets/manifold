// Pure geometry for the explorer's SVG: shape bounds (for zooming to search
// results), keyboard movement between shapes, and label placement.

import type { Bounds, Point } from './map-camera'

// Bounds of an absolute SVG path such as d3-geo's "M1,2L3,4Z" output.
export function pathBounds(d: string): Bounds | undefined {
  const numbers = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
  if (numbers.length < 2) return undefined
  const bounds = {
    x0: Infinity,
    y0: Infinity,
    x1: -Infinity,
    y1: -Infinity,
  }
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const [x, y] = [numbers[i], numbers[i + 1]]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    bounds.x0 = Math.min(bounds.x0, x)
    bounds.y0 = Math.min(bounds.y0, y)
    bounds.x1 = Math.max(bounds.x1, x)
    bounds.y1 = Math.max(bounds.y1, y)
  }
  return Number.isFinite(bounds.x0) ? bounds : undefined
}

export function unionBounds(all: (Bounds | undefined)[]): Bounds | undefined {
  const present = all.filter((b): b is Bounds => !!b)
  if (!present.length) return undefined
  return {
    x0: Math.min(...present.map((b) => b.x0)),
    y0: Math.min(...present.map((b) => b.y0)),
    x1: Math.max(...present.map((b) => b.x1)),
    y1: Math.max(...present.map((b) => b.y1)),
  }
}

export type Direction = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
const VECTORS: Record<Direction, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}
export const isDirection = (key: string): key is Direction => key in VECTORS

// The nearest shape in the arrow's direction (within ±60°), preferring
// shapes in line with the current one. Undefined at the edge of the map.
export function nextShape(
  from: Point,
  shapes: { id: string; center: Point }[],
  direction: Direction
): string | undefined {
  const v = VECTORS[direction]
  let best: { id: string; score: number } | undefined
  for (const { id, center } of shapes) {
    const dx = center.x - from.x
    const dy = center.y - from.y
    const along = dx * v.x + dy * v.y
    const across = Math.abs(dx * v.y - dy * v.x)
    if (along <= 0.5 || across > along * Math.tan(Math.PI / 3)) continue
    const score = along + 2 * across
    if (!best || score < best.score) best = { id, score }
  }
  return best?.id
}

// Reading order (top to bottom, then left to right) for the first stop.
export function firstShape(shapes: { id: string; center: Point }[]) {
  return [...shapes].sort(
    (a, b) =>
      Math.round(a.center.y / 40) - Math.round(b.center.y / 40) ||
      a.center.x - b.center.x
  )[0]?.id
}

type Hex = { x: number; y: number }
type Anchor = 'middle' | 'start' | 'end'

// A label's footprint: its center and half width, in hex coordinates.
export type LabelBox = { x: number; y: number; halfWidth: number }

// Where to put a state's cartogram label: above its top hex unless that
// lands on another state's hexes or an earlier label, then below, left or
// right of the group.
export function placeHexLabel(
  own: Hex[],
  others: Hex[],
  size: number,
  text: string,
  placed: LabelBox[] = []
): Point & { anchor: Anchor; box: LabelBox } {
  const top = own.reduce((a, b) => (a.y < b.y ? a : b))
  const bottom = own.reduce((a, b) => (a.y > b.y ? a : b))
  const left = own.reduce((a, b) => (a.x < b.x ? a : b))
  const right = own.reduce((a, b) => (a.x > b.x ? a : b))
  const halfWidth = text.length * size * 0.32 + 2
  const halfHeight = size * 0.45
  const box = (x: number, y: number, anchor: Anchor): LabelBox => ({
    x:
      anchor === 'middle'
        ? x
        : anchor === 'start'
        ? x + halfWidth
        : x - halfWidth,
    y: y - halfHeight,
    halfWidth,
  })
  const clear = (b: LabelBox) =>
    others.every(
      (h) =>
        Math.abs(h.x - b.x) > halfWidth + size * 0.8 ||
        Math.abs(h.y - b.y) > halfHeight + size * 0.8
    ) &&
    placed.every(
      (p) =>
        Math.abs(p.x - b.x) > halfWidth + p.halfWidth + 1 ||
        Math.abs(p.y - b.y) > halfHeight * 2 + 1
    )
  const candidates: (Point & { anchor: Anchor })[] = [
    { x: top.x, y: top.y - size * 1.25, anchor: 'middle' },
    { x: bottom.x, y: bottom.y + size * 1.9, anchor: 'middle' },
    { x: left.x - size * 1.15, y: left.y + size * 0.4, anchor: 'end' },
    { x: right.x + size * 1.15, y: right.y + size * 0.4, anchor: 'start' },
  ]
  const chosen =
    candidates.find((c) => clear(box(c.x, c.y, c.anchor))) ?? candidates[0]
  return { ...chosen, box: box(chosen.x, chosen.y, chosen.anchor) }
}

// Places every state's label in turn, so later labels avoid earlier ones.
export function placeHexLabels(
  states: string[],
  hexes: (Hex & { state: string })[],
  size: number
) {
  const boxes: LabelBox[] = []
  return states.flatMap((state) => {
    const own = hexes.filter((h) => h.state === state)
    if (!own.length) return []
    const others = hexes.filter((h) => h.state !== state)
    const at = placeHexLabel(own, others, size, state, boxes)
    boxes.push(at.box)
    return [{ state, x: at.x, y: at.y, anchor: at.anchor }]
  })
}
