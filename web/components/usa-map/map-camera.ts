export type Point = { x: number; y: number }
export type MapCamera = Point & { k: number }
export type MapViewport = Point & { width: number; height: number }
export const INITIAL_CAMERA: MapCamera = { x: 0, y: 0, k: 1 }

// Include the letterboxed area in the viewport, so a tall mobile map can
// actually use that space when zooming and panning.
export function mapViewport(width: number, height: number): MapViewport {
  const scale = Math.min(width / 960, height / 600) || 1
  const w = width / scale
  const h = height / scale
  return { x: (960 - w) / 2, y: 0, width: w, height: h }
}

export function clampCamera(
  camera: MapCamera,
  viewport: MapViewport
): MapCamera {
  const k = Math.max(1, Math.min(6, camera.k))
  const axis = (
    position: number,
    size: number,
    start: number,
    visible: number
  ) => {
    // Leave room to move the map beside a popup, even at the overview.
    // Keep half of the smaller map/viewport dimension visible on each axis
    // so the map cannot be dragged completely out of reach.
    const overlap = Math.min(size * k, visible) / 2
    return Math.max(
      start + overlap - size * k,
      Math.min(start + visible - overlap, position)
    )
  }
  return {
    k,
    x: axis(camera.x, 960, viewport.x, viewport.width),
    y: axis(camera.y, 600, viewport.y, viewport.height),
  }
}

export function gestureCamera(
  camera: MapCamera,
  start: Point[],
  current: Point[],
  viewport: MapViewport
): MapCamera {
  const center = (points: Point[]) => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  })
  const distance = (points: Point[]) =>
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
  const factor =
    start.length === 2 && current.length === 2
      ? distance(current) / Math.max(1, distance(start))
      : 1
  const k = Math.max(1, Math.min(6, camera.k * factor))
  const from = center(start)
  const to = center(current)
  return clampCamera(
    {
      k,
      x: to.x - ((from.x - camera.x) * k) / camera.k,
      y: to.y - ((from.y - camera.y) * k) / camera.k,
    },
    viewport
  )
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number }

// Centers the bounds in the viewport, as close as `maxZoom` allows, leaving
// `padding` map units around them. Small or single districts get a close
// view; country-wide selections stay at the overview. `shiftX` moves the
// framed area left (in viewport units), e.g. to clear a side panel.
export function fitCamera(
  bounds: Bounds,
  viewport: MapViewport,
  {
    padding = 30,
    maxZoom = 6,
    shiftX = 0,
  }: { padding?: number; maxZoom?: number; shiftX?: number } = {}
): MapCamera {
  const width = Math.max(1, bounds.x1 - bounds.x0 + 2 * padding)
  const height = Math.max(1, bounds.y1 - bounds.y0 + 2 * padding)
  const fit = Math.min(viewport.width / width, viewport.height / height)
  const k = Math.max(1, Math.min(maxZoom, 6, Number.isFinite(fit) ? fit : 1))
  const cx = (bounds.x0 + bounds.x1) / 2
  const cy = (bounds.y0 + bounds.y1) / 2
  return clampCamera(
    {
      k,
      x: viewport.x + viewport.width / 2 - shiftX - cx * k,
      y: viewport.y + viewport.height / 2 - cy * k,
    },
    viewport
  )
}

export function zoomCamera(
  camera: MapCamera,
  factor: number,
  origin: Point,
  viewport: MapViewport
): MapCamera {
  const k = Math.max(1, Math.min(6, camera.k * factor))
  return clampCamera(
    {
      k,
      x: origin.x - ((origin.x - camera.x) * k) / camera.k,
      y: origin.y - ((origin.y - camera.y) * k) / camera.k,
    },
    viewport
  )
}
