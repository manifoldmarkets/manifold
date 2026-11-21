// The election atlas's shapes in map coordinates (a 960 × 600 frame): the
// geographic states and House districts, the one-hex-per-district House
// cartogram and the one-tile-per-state grid. Shared by the 2026 explorer and
// the /election map, so both draw, label and hit-test the same geometry.

import { Bounds, Point } from './map-camera'
import { pathBounds } from './map-geometry'

export type Atlas = {
  states: { state: string; name: string; path: string; center: number[] }[]
  districts: {
    state: string
    district: number
    path: string
    center: number[]
  }[]
  hex: {
    size: number
    width: number
    height: number
    hexes: { state: string; district: number; x: number; y: number }[]
  }
  tiles: { state: string; row: number; col: number }[]
}

export type Shape = {
  id: string
  d?: string
  rect?: { x: number; y: number; width: number; height: number; rx: number }
  bounds: Bounds
  center: Point
}

// Small northeastern states are labelled from a column to their right; their
// map labels would overlap (VT/NH) or not fit.
export const CALLOUTS = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD']
export const calloutY = (i: number) => 191 + i * 29
export const UNLABELLED = ['DC', ...CALLOUTS]
// Where the centroid sits on a border or in the sea.
export const LABEL_AT: Record<string, Point> = {
  FL: { x: 785, y: 496 },
  LA: { x: 578, y: 449 },
}
// States too small to tap on a phone get an invisible 44px target.
export const TINY_STATES = ['RI', 'DE', 'CT', 'NJ', 'VT', 'NH', 'MA', 'MD']
export const HIT_RADIUS_PX = 22

// The atlas, fetched once per page however many maps draw from it (it's
// over a megabyte). A failed fetch is forgotten so the next call retries.
let atlasRequest: Promise<Atlas> | undefined
export function loadAtlas(): Promise<Atlas> {
  atlasRequest ??= fetch('/data/election-atlas.json')
    .then((r) => {
      if (!r.ok) throw new Error('Map unavailable')
      return r.json() as Promise<Atlas>
    })
    .catch((e) => {
      atlasRequest = undefined
      throw e
    })
  return atlasRequest
}

export const districtId = (state: string, district: number) =>
  `${state}-${district}`

export const hexPath = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return `${i ? 'L' : 'M'}${x + Math.cos(angle) * r},${
      y + Math.sin(angle) * r
    }`
  }).join(' ') + 'Z'

export const hexLayout = (hex: Atlas['hex']) => {
  const s = Math.min(900 / hex.width, 530 / hex.height)
  return { s, tx: (960 - hex.width * s) / 2, ty: 35 }
}

const pathShape = (id: string, path: string, center: number[]): Shape => ({
  id,
  d: path,
  bounds: pathBounds(path) ?? {
    x0: center[0],
    y0: center[1],
    x1: center[0],
    y1: center[1],
  },
  center: { x: center[0], y: center[1] },
})

export const stateShapes = (atlas: Atlas): Shape[] =>
  atlas.states.map((s) => pathShape(s.state, s.path, s.center))

export const districtShapes = (atlas: Atlas): Shape[] =>
  atlas.districts.map((d) =>
    pathShape(districtId(d.state, d.district), d.path, d.center)
  )

export function hexShapes(atlas: Atlas): Shape[] {
  const { s, tx, ty } = hexLayout(atlas.hex)
  const r = atlas.hex.size * 0.92 * s
  return atlas.hex.hexes.map((h) => {
    const x = tx + h.x * s
    const y = ty + h.y * s
    return {
      id: districtId(h.state, h.district),
      d: hexPath(x, y, r),
      bounds: { x0: x - r, y0: y - r, x1: x + r, y1: y + r },
      center: { x, y },
    }
  })
}

export const TILE = { x0: 76, y0: 20, dx: 73, dy: 70, width: 65, height: 62 }

// One tile per state (DC has none).
export const tileShapes = (atlas: Atlas): Shape[] =>
  atlas.tiles
    .filter((t) => t.state !== 'DC')
    .map((t) => {
      const x = TILE.x0 + t.col * TILE.dx
      const y = TILE.y0 + t.row * TILE.dy
      return {
        id: t.state,
        rect: { x, y, width: TILE.width, height: TILE.height, rx: 6 },
        bounds: { x0: x, y0: y, x1: x + TILE.width, y1: y + TILE.height },
        center: { x: x + TILE.width / 2, y: y + TILE.height / 2 },
      }
    })
