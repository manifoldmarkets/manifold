import { Point } from './map-camera'

export type CardBounds = {
  left: number
  right: number
  top: number
  bottom: number
}
type CardSize = { width: number; height: number }

export function clampRaceCard(
  point: Point,
  size: CardSize,
  bounds: CardBounds
): Point {
  return {
    x: Math.max(bounds.left, Math.min(bounds.right - size.width, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom - size.height, point.y)),
  }
}

export function placeRaceCard(
  cursor: Point,
  size: CardSize,
  bounds: CardBounds
): Point {
  return clampRaceCard(
    {
      x:
        cursor.x + 16 + size.width <= bounds.right
          ? cursor.x + 16
          : cursor.x - size.width - 16,
      y: cursor.y + 16,
    },
    // Reserve room for the betting controls when the preview is pinned.
    { width: size.width, height: Math.max(220, size.height) },
    bounds
  )
}
