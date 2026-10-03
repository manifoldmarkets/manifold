import { useEffect, useRef, useState } from 'react'

const DRAG_THRESHOLD_PX = 6

// Keep animation and dragging on the same offset so grabbing the tape never
// jumps back to the beginning of a CSS animation.
export const useDraggableTicker = (marketCount: number) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const [copies, setCopies] = useState(2)

  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    const group = groupRef.current
    if (!viewport || !track || !group) return

    const duration = Math.max(24, marketCount * 9)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0
    let offset = 0
    let velocity = 0
    let focused = false
    let suppressClick = false
    let gesture:
      | {
          id: number
          startX: number
          startY: number
          x: number
          time: number
          dragging: boolean
        }
      | undefined

    const draw = () => {
      if (!width) return
      offset = ((offset % width) + width) % width
      track.style.transform = `translateX(${-offset}px)`
    }
    const measure = () => {
      width = group.getBoundingClientRect().width
      // Fill even a wide screen with only one or two available markets.
      if (width) setCopies(Math.ceil(viewport.clientWidth / width) + 1)
      draw()
    }
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(group)
    measure()

    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return
      velocity = 0
      focused = false
      suppressClick = false
      gesture = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        time: performance.now(),
        dragging: false,
      }
    }
    const move = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return
      const dx = event.clientX - gesture.startX
      const dy = event.clientY - gesture.startY
      if (!gesture.dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_THRESHOLD_PX) return
        // Leave vertical gestures to the page. touch-action allows pan-y.
        if (Math.abs(dy) > Math.abs(dx)) {
          gesture = undefined
          return
        }
        gesture.dragging = true
        suppressClick = true
        viewport.setPointerCapture(event.pointerId)
      }
      const now = performance.now()
      const delta = gesture.x - event.clientX
      velocity = Math.max(
        -3,
        Math.min(3, delta / Math.max(1, now - gesture.time))
      )
      offset += delta
      gesture.x = event.clientX
      gesture.time = now
      draw()
    }
    const end = (event: PointerEvent) => {
      // Touch starts with implicit capture on the button. Transferring that
      // capture to the viewport must not end the gesture.
      if (event.type === 'lostpointercapture' && event.target !== viewport)
        return
      if (!gesture || gesture.id !== event.pointerId) return
      if (
        event.type !== 'pointerup' ||
        !gesture.dragging ||
        performance.now() - gesture.time > 100 ||
        reducedMotion.matches
      )
        velocity = 0
      gesture = undefined
      if (viewport.hasPointerCapture(event.pointerId))
        viewport.releasePointerCapture(event.pointerId)
    }
    const click = (event: MouseEvent) => {
      // Keyboard activation (detail === 0) must still work after a swipe.
      if (!suppressClick || event.detail === 0) return
      event.preventDefault()
      event.stopPropagation()
      suppressClick = false
    }
    const leave = (event: PointerEvent) => {
      if (gesture && !gesture.dragging) end(event)
    }
    const focus = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches(':focus-visible'))
        return
      focused = true
      velocity = 0
      // The browser may scroll overflow:hidden when focusing an offscreen
      // button. Move our offset instead, keeping the keyboard target visible.
      viewport.scrollLeft = 0
      const bounds = target.getBoundingClientRect()
      const view = viewport.getBoundingClientRect()
      if (bounds.left < view.left) offset += bounds.left - view.left
      else if (bounds.right > view.right) offset += bounds.right - view.right
      draw()
    }
    const blur = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        viewport.contains(event.relatedTarget)
      )
        return
      focused = false
    }
    let previous = performance.now()
    let frame: number
    const animate = (now: number) => {
      const elapsed = Math.min(now - previous, 64)
      previous = now
      if (!gesture && !focused && !document.hidden) {
        if (Math.abs(velocity) > 0.015 && !reducedMotion.matches) {
          offset += velocity * elapsed
          velocity *= Math.exp(-elapsed / 250)
        } else if (!reducedMotion.matches) {
          velocity = 0
          offset += (width * elapsed) / (duration * 1000)
        }
        draw()
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    viewport.addEventListener('pointerdown', down)
    viewport.addEventListener('pointermove', move)
    viewport.addEventListener('pointerup', end)
    viewport.addEventListener('pointercancel', end)
    viewport.addEventListener('lostpointercapture', end)
    viewport.addEventListener('click', click, true)
    viewport.addEventListener('pointerleave', leave)
    viewport.addEventListener('focusin', focus)
    viewport.addEventListener('focusout', blur)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      viewport.removeEventListener('pointerdown', down)
      viewport.removeEventListener('pointermove', move)
      viewport.removeEventListener('pointerup', end)
      viewport.removeEventListener('pointercancel', end)
      viewport.removeEventListener('lostpointercapture', end)
      viewport.removeEventListener('click', click, true)
      viewport.removeEventListener('pointerleave', leave)
      viewport.removeEventListener('focusin', focus)
      viewport.removeEventListener('focusout', blur)
    }
  }, [marketCount])

  return { viewportRef, trackRef, groupRef, copies }
}
