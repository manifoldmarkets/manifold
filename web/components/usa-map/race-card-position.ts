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

type AnchorRect = { left: number; right: number; top: number; bottom: number }

// A pinned race card docks beside its shape: to the right when it fits, else
// to the left, else against the right edge; vertically next to the shape and
// kept fully on screen (below the sticky toolbar), so it never opens over
// the controls or squeezed against the bottom of the window.
export function placeBesideRace(
  anchor: AnchorRect,
  size: CardSize,
  bounds: CardBounds,
  gap = 16
): Point {
  const x =
    anchor.right + gap + size.width <= bounds.right
      ? anchor.right + gap
      : anchor.left - gap - size.width >= bounds.left
      ? anchor.left - gap - size.width
      : bounds.right - size.width
  return clampRaceCard(
    { x, y: anchor.top - 24 },
    { width: size.width, height: Math.max(260, size.height) },
    bounds
  )
}
