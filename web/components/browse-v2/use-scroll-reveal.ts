import { RefObject, useEffect, useState } from 'react'

// A little travel before changing direction avoids flicker from touch jitter.
const SCROLL_THRESHOLD = 8

export function useScrollReveal(
  searchRef: RefObject<HTMLDivElement>,
  filtersRef: RefObject<HTMLDivElement>,
  enabled: boolean
) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(false)
    if (!enabled) return

    const scrollPosition = () => {
      const scroller =
        filtersRef.current?.closest('.page-scroll-container') ??
        document.scrollingElement
      if (!scroller) return 0
      // Ignore Safari's rubber-band overscroll at either end of the page.
      return Math.max(
        0,
        Math.min(
          scroller.scrollTop,
          scroller.scrollHeight - scroller.clientHeight
        )
      )
    }
    let lastY = scrollPosition()
    let directionStart = lastY
    let direction = 0
    let frame: number | undefined

    const update = () => {
      frame = undefined
      const y = scrollPosition()
      const nextDirection = Math.sign(y - lastY)
      if (nextDirection === 0) return
      if (nextDirection !== direction) {
        directionStart = lastY
        direction = nextDirection
      }
      lastY = y

      const search = searchRef.current
      const filters = filtersRef.current
      if (!search || !filters) return
      const editingSearch =
        search.contains(document.activeElement) &&
        document.activeElement?.matches(
          'input, textarea, [contenteditable="true"]'
        )
      const menuOpen = filters.querySelector('[aria-expanded="true"]')
      const pinned =
        filters.getBoundingClientRect().top <=
        search.getBoundingClientRect().height + 1

      if (y === 0 || !pinned || editingSearch || menuOpen) {
        setHidden(false)
        directionStart = y
      } else if (Math.abs(y - directionStart) >= SCROLL_THRESHOLD) {
        setHidden(direction > 0)
      }
    }

    const onScroll = (event: Event) => {
      // Capture the iOS Page container as well as normal document scrolling,
      // but ignore horizontal filter strips and scrollable popover panels.
      const target = event.target
      if (
        target !== document &&
        !(
          target instanceof Element &&
          target.classList.contains('page-scroll-container')
        )
      )
        return
      if (frame === undefined) frame = requestAnimationFrame(update)
    }
    const onFocus = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        (searchRef.current?.contains(event.target) ||
          filtersRef.current?.contains(event.target))
      )
        setHidden(false)
    }

    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    })
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('focusin', onFocus)
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [enabled, searchRef, filtersRef])

  return enabled && hidden
}
