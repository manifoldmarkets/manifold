import { useEffect, useRef, useState } from 'react'
import {
  clampCamera,
  gestureCamera,
  INITIAL_CAMERA,
  MapCamera,
  mapViewport,
  Point,
} from './map-camera'

export function useMapCamera(ready: boolean) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [camera, setCamera] = useState(INITIAL_CAMERA)
  const cameraRef = useRef(camera)
  const [viewport, setViewport] = useState(mapViewport(960, 600))
  const viewportRef = useRef(viewport)
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
      if (
        e.pointerType === 'touch' ||
        !start ||
        !mouseOrigin ||
        !e.buttons ||
        cameraRef.current.k === 1
      )
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
    }
  }, [ready])

  return {
    svgRef,
    camera,
    dragged,
    viewBox: `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`,
    resetView: () => update(INITIAL_CAMERA),
    zoom: (factor: number) => {
      const current = cameraRef.current
      const k = Math.max(1, Math.min(6, current.k * factor))
      update(
        clampCamera(
          {
            k,
            x: 480 - ((480 - current.x) * k) / current.k,
            y: 300 - ((300 - current.y) * k) / current.k,
          },
          viewportRef.current
        )
      )
    },
  }
}
