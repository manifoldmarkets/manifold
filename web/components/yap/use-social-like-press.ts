import { useEffect, useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'

// Match the site's 500 ms hold gesture while retaining native click/keyboard
// activation and allowing touch scrolling to cancel a pending hold.
export function useSocialLikePress(
  onLike: () => void,
  onShowLikers: () => void,
  disabled: boolean
) {
  const callbacks = useRef({ onLike, onShowLikers, disabled })
  callbacks.current = { onLike, onShowLikers, disabled }
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const press = useRef<{ id: number; x: number; y: number }>()
  const suppressClick = useRef(false)

  const clear = () => {
    clearTimeout(timer.current)
    timer.current = undefined
    press.current = undefined
  }
  useEffect(() => clear, [])
  useEffect(() => {
    if (disabled) clear()
  }, [disabled])

  const cancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (press.current?.id !== event.pointerId) return
    suppressClick.current = true
    clear()
  }
  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      clear()
      suppressClick.current = false
      if (
        callbacks.current.disabled ||
        !event.isPrimary ||
        event.button !== 0 ||
        event.pointerType === 'mouse'
      )
        return
      press.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      }
      timer.current = setTimeout(() => {
        timer.current = undefined
        suppressClick.current = true
        if (!callbacks.current.disabled) callbacks.current.onShowLikers()
      }, 500)
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const start = press.current
      if (
        start?.id === event.pointerId &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
      )
        cancel(event)
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (press.current?.id === event.pointerId) clear()
    },
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onLostPointerCapture: cancel,
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) =>
      event.preventDefault(),
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (
        !callbacks.current.disabled &&
        (event.detail === 0 || !suppressClick.current)
      )
        callbacks.current.onLike()
      suppressClick.current = false
    },
  }
}
