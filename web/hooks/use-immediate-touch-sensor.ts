import { useEffect, useRef } from 'react'
import type {
  FluidDragActions,
  PreDragActions,
  SensorAPI,
} from '@hello-pangea/dnd'

// Less movement than this is still a tap (same slop as the library's mouse sensor)
const TAP_SLOP_PX = 5
// The library's touch sensor lifts after this long, so press-and-hold still works
const LONG_PRESS_MS = 120

type Point = { x: number; y: number }

type Phase =
  | { type: 'idle' }
  | {
      type: 'pending'
      touchId: number
      start: Point
      actions: PreDragActions
      longPress: ReturnType<typeof setTimeout>
    }
  | { type: 'dragging'; touchId: number; actions: FluidDragActions }

const IDLE: Phase = { type: 'idle' }

// A touch sensor for @hello-pangea/dnd that starts dragging as soon as the
// finger moves. The library's own touch sensor waits for a 120ms press and
// gives any earlier movement to the browser, so a quick swipe on an item
// scrolls the page instead of moving the item. Pass it with
// enableDefaultSensors={false}, useMouseSensor and useKeyboardSensor, and give
// draggable items `touch-action: none`: once the browser has started
// scrolling, the touch can't be taken back.
export function useImmediateTouchSensor(api: SensorAPI) {
  const phaseRef = useRef<Phase>(IDLE)

  useEffect(() => {
    let startWidth = 0

    // Forget the touch. Also the library's forceStop when it takes the lock back.
    const stop = () => {
      const phase = phaseRef.current
      if (phase.type === 'pending') clearTimeout(phase.longPress)
      phaseRef.current = IDLE
    }

    const cancel = () => {
      const phase = phaseRef.current
      stop()
      if (phase.type === 'pending') phase.actions.abort()
      if (phase.type === 'dragging')
        phase.actions.cancel({ shouldBlockNextClick: true })
    }

    const lift = (point: Point) => {
      const phase = phaseRef.current
      if (phase.type !== 'pending') return
      clearTimeout(phase.longPress)
      phaseRef.current = {
        type: 'dragging',
        touchId: phase.touchId,
        actions: phase.actions.fluidLift(point),
      }
    }

    const trackedTouch = (event: TouchEvent) => {
      const phase = phaseRef.current
      if (phase.type === 'idle') return undefined
      return Array.from(event.changedTouches).find(
        (touch) => touch.identifier === phase.touchId
      )
    }

    const onTouchStart = (event: TouchEvent) => {
      const phase = phaseRef.current
      // A second finger before the item lifts is a pinch, not a drag
      if (phase.type === 'pending') {
        cancel()
        return
      }
      if (
        phase.type === 'dragging' ||
        event.defaultPrevented ||
        event.touches.length > 1
      )
        return

      const draggableId = api.findClosestDraggableId(event)
      if (!draggableId) return
      const actions = api.tryGetLock(draggableId, stop, { sourceEvent: event })
      if (!actions) return

      const touch = event.changedTouches[0]
      const start = { x: touch.clientX, y: touch.clientY }
      startWidth = window.innerWidth
      phaseRef.current = {
        type: 'pending',
        touchId: touch.identifier,
        start,
        actions,
        longPress: setTimeout(() => lift(start), LONG_PRESS_MS),
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = trackedTouch(event)
      if (!touch) return
      // The touch is ours: don't let the browser scroll with it
      event.preventDefault()
      const point = { x: touch.clientX, y: touch.clientY }
      const phase = phaseRef.current
      if (phase.type === 'dragging') {
        phase.actions.move(point)
      } else if (
        phase.type === 'pending' &&
        (Math.abs(point.x - phase.start.x) >= TAP_SLOP_PX ||
          Math.abs(point.y - phase.start.y) >= TAP_SLOP_PX)
      ) {
        // Lift under the finger, so the item doesn't jump by the slop
        lift(point)
      }
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (!trackedTouch(event)) return
      const phase = phaseRef.current
      if (phase.type !== 'dragging') {
        // A tap: leave the browser its click
        cancel()
        return
      }
      // No emulated mouse events or click after a drop
      event.preventDefault()
      stop()
      phase.actions.drop({ shouldBlockNextClick: true })
    }

    const onTouchCancel = (event: TouchEvent) => {
      if (trackedTouch(event)) cancel()
    }

    // Android opens a context menu on long press
    const onContextMenu = (event: Event) => {
      if (phaseRef.current.type !== 'idle') event.preventDefault()
    }

    // As in the library's touch sensor, any key (e.g. Escape on a tablet's
    // keyboard) cancels a touch drag
    const onKeyDown = (event: KeyboardEvent) => {
      if (phaseRef.current.type === 'idle') return
      if (event.key === 'Escape') event.preventDefault()
      cancel()
    }

    // Rotating the phone reflows the list under the drag. A height-only resize
    // is just the browser's toolbar moving, e.g. while the window auto-scrolls.
    const onResize = () => {
      if (phaseRef.current.type !== 'idle' && window.innerWidth !== startWidth)
        cancel()
    }

    // Hiding the page may never send touchend
    const onVisibilityChange = () => {
      if (phaseRef.current.type !== 'idle') cancel()
    }

    // Not passive, so preventDefault can stop scrolling. touchmove stays bound
    // for the sensor's lifetime because Safari ignores preventDefault from a
    // touchmove listener added in the middle of a touch.
    const options = { capture: true, passive: false }
    window.addEventListener('touchstart', onTouchStart, options)
    window.addEventListener('touchmove', onTouchMove, options)
    window.addEventListener('touchend', onTouchEnd, options)
    window.addEventListener('touchcancel', onTouchCancel, options)
    window.addEventListener('contextmenu', onContextMenu, options)
    window.addEventListener('keydown', onKeyDown, options)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      // The library abandons any lock it still holds when it unmounts
      stop()
      window.removeEventListener('touchstart', onTouchStart, options)
      window.removeEventListener('touchmove', onTouchMove, options)
      window.removeEventListener('touchend', onTouchEnd, options)
      window.removeEventListener('touchcancel', onTouchCancel, options)
      window.removeEventListener('contextmenu', onContextMenu, options)
      window.removeEventListener('keydown', onKeyDown, options)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [api])
}
