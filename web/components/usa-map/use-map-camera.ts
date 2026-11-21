import { useEffect, useRef, useState } from 'react'
import {
  Bounds,
  clampCamera,
  fitCamera,
  gestureCamera,
  INITIAL_CAMERA,
  MapCamera,
  mapViewport,
  Point,
  zoomCamera,
} from './map-camera'

export function useMapCamera(ready: boolean) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [camera, setCamera] = useState(INITIAL_CAMERA)
  const cameraRef = useRef(camera)
  const [viewport, setViewport] = useState(mapViewport(960, 600))
  const viewportRef = useRef(viewport)
  // Screen pixels per map unit at the overview, for touch-sized hit areas.
  const [pixelsPerUnit, setPixelsPerUnit] = useState(1)
  const dragged = useRef(false)
  const update = (next: MapCamera) => {
    cameraRef.current = next
    setCamera(next)
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const resize = () => {
      const bounds = svg.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const next = mapViewport(bounds.width, bounds.height)
      viewportRef.current = next
      setViewport(next)
      setPixelsPerUnit(bounds.width / next.width)
      update(clampCamera(cameraRef.current, next))
    }
    const observer = new ResizeObserver(resize)
    observer.observe(svg)
    resize()

    const point = (event: { clientX: number; clientY: number }): Point => {
      const bounds = svg.getBoundingClientRect()
      const view = viewportRef.current
      return {
        x: view.x + ((event.clientX - bounds.left) * view.width) / bounds.width,
        y:
          view.y + ((event.clientY - bounds.top) * view.height) / bounds.height,
      }
    }
    let start: { points: Point[]; camera: MapCamera } | undefined
    let mouseOrigin: Point | undefined
    let ownsTouch = false
    const touchPoints = (e: TouchEvent) =>
      Array.from(e.touches).slice(0, 2).map(point)
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        dragged.current = false
        ownsTouch = false
      } else {
        e.preventDefault()
        dragged.current = true
        ownsTouch = true
      }
      start = { points: touchPoints(e), camera: cameraRef.current }
    }
    const touchMove = (e: TouchEvent) => {
      if (!start) return
      const points = touchPoints(e)
      if (points.length !== start.points.length) return
      if (
        Math.hypot(
          points[0].x - start.points[0].x,
          points[0].y - start.points[0].y
        ) > 8
      )
        dragged.current = true
      // At the overview, a single finger still scrolls the page normally.
      if (points.length < 2 && cameraRef.current.k === 1) return
      ownsTouch = true
      e.preventDefault()
      update(
        gestureCamera(start.camera, start.points, points, viewportRef.current)
      )
    }
    const touchEnd = (e: TouchEvent) => {
      if (ownsTouch && e.cancelable) e.preventDefault()
      start = e.touches.length
        ? { points: touchPoints(e), camera: cameraRef.current }
        : undefined
    }
    const pointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return
      dragged.current = false
      mouseOrigin = { x: e.clientX, y: e.clientY }
      start = { points: [point(e)], camera: cameraRef.current }
    }
    const pointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !start || !mouseOrigin || !e.buttons)
        return
      if (
        Math.hypot(e.clientX - mouseOrigin.x, e.clientY - mouseOrigin.y) > 4
      ) {
        dragged.current = true
        svg.setPointerCapture(e.pointerId)
      }
      if (dragged.current)
        update(
          gestureCamera(
            start.camera,
            start.points,
            [point(e)],
            viewportRef.current
          )
        )
    }
    const pointerEnd = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (svg.hasPointerCapture(e.pointerId))
        svg.releasePointerCapture(e.pointerId)
      start = undefined
      mouseOrigin = undefined
    }
    const wheel = (e: WheelEvent) => {
      // The map owns the wheel even at its zoom limits, avoiding a sudden
      // jump to page scrolling when zooming out reaches the overview.
      e.preventDefault()
      if (!e.deltaY) return
      const current = cameraRef.current
      if (
        (current.k === 1 && e.deltaY > 0) ||
        (current.k === 6 && e.deltaY < 0)
      )
        return
      const unit =
        e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
          ? svg.getBoundingClientRect().height
          : 1
      // Trackpad pinches arrive as small ctrl-wheel deltas.
      const delta = Math.max(
        -200,
        Math.min(200, e.deltaY * unit * (e.ctrlKey ? 5 : 1))
      )
      update(
        zoomCamera(
          current,
          Math.exp(-delta * 0.002),
          point(e),
          viewportRef.current
        )
      )
    }
    // Native, non-passive listeners let a two-finger gesture zoom the map
    // without zooming the page; React's delegated touch listeners are passive.
    svg.addEventListener('touchstart', touchStart, { passive: false })
    svg.addEventListener('touchmove', touchMove, { passive: false })
    svg.addEventListener('touchend', touchEnd, { passive: false })
    svg.addEventListener('touchcancel', touchEnd, { passive: false })
    svg.addEventListener('pointerdown', pointerDown)
    svg.addEventListener('pointermove', pointerMove)
    svg.addEventListener('pointerup', pointerEnd)
    svg.addEventListener('pointercancel', pointerEnd)
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer.disconnect()
      svg.removeEventListener('touchstart', touchStart)
      svg.removeEventListener('touchmove', touchMove)
      svg.removeEventListener('touchend', touchEnd)
      svg.removeEventListener('touchcancel', touchEnd)
      svg.removeEventListener('pointerdown', pointerDown)
      svg.removeEventListener('pointermove', pointerMove)
      svg.removeEventListener('pointerup', pointerEnd)
      svg.removeEventListener('pointercancel', pointerEnd)
      svg.removeEventListener('wheel', wheel)
    }
  }, [ready])

  return {
    svgRef,
    camera,
    dragged,
    pixelsPerUnit,
    viewBox: `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
    resetView: () => update(INITIAL_CAMERA),
    zoom: (factor: number) => {
      update(
        zoomCamera(
          cameraRef.current,
          factor,
          { x: 480, y: 300 },
          viewportRef.current
        )
      )
    },
    // Frames the bounds; anything that would barely zoom shows the overview.
    fit: (bounds: Bounds, maxZoom = 6, shiftPx = 0) => {
      const view = viewportRef.current
      const width = svgRef.current?.getBoundingClientRect().width
      const shiftX = width ? (shiftPx * view.width) / width : 0
      const next = fitCamera(bounds, view, { maxZoom, shiftX })
      update(next.k < 1.25 ? INITIAL_CAMERA : next)
    },
  }
}
