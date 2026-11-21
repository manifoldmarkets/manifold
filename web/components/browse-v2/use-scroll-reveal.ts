import { RefObject, useEffect } from 'react'

// Ignore a little finger jitter at either end of the header's travel. Once
// moving, follow the scroll distance directly, including direction changes.
const SCROLL_THRESHOLD = 8

export function useScrollReveal(
  searchRef: RefObject<HTMLDivElement>,
  filtersRef: RefObject<HTMLDivElement>,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return
    const search = searchRef.current
    const filters = filtersRef.current
    if (!search || !filters) return

    // Page adds the iOS scrolling container after hydration.
    const pageScroller = () => filters.closest('.page-scroll-container')
    const scrollPosition = () => {
      const scroller = pageScroller() ?? document.scrollingElement
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
    let offset = 0
    let pendingTravel = 0
    let direction = 0
    let frame: number | undefined

    const gapBeforePinning = () =>
      Math.max(
        0,
        filters.getBoundingClientRect().top +
          offset -
          (pageScroller()?.getBoundingClientRect().top ?? 0) -
          search.offsetHeight
      )
    let previousGap = gapBeforePinning()

    // Keep per-frame updates out of React so scrolling doesn't re-render the
    // market feed. Both bars move as one stack, with no timed CSS transition.
    const applyOffset = (next: number) => {
      const searchHeight = search.offsetHeight
      const totalHeight = searchHeight + filters.offsetHeight
      offset = Math.max(0, Math.min(next, totalHeight))
      for (const [element, hiddenAt] of [
        [search, searchHeight],
        [filters, totalHeight],
      ] as const) {
        const hidden = offset >= hiddenAt
        element.style.transform = `translate3d(0, ${-offset}px, 0)`
        element.style.pointerEvents = hidden ? 'none' : ''
        // Offscreen controls shouldn't capture keyboard focus or screen readers.
        element.toggleAttribute('inert', hidden)
        if (hidden) element.setAttribute('aria-hidden', 'true')
        else element.removeAttribute('aria-hidden')
      }
    }

    const reveal = () => {
      pendingTravel = 0
      direction = 0
      applyOffset(0)
    }

    const update = () => {
      frame = undefined
      const y = scrollPosition()
      const delta = y - lastY
      lastY = y
      const gap = gapBeforePinning()
      // On the first frame that pins the filters, only consume the part of
      // the scroll that happened after pinning, avoiding a jump at the top.
      const travel = delta > 0 ? Math.max(0, delta - previousGap) : delta
      previousGap = gap
      const editingSearch =
        search.contains(document.activeElement) &&
        document.activeElement?.matches(
          'input, textarea, [contenteditable="true"]'
        )
      const menuOpen = filters.querySelector('[aria-expanded="true"]')

      if (y === 0 || gap > 1 || editingSearch || menuOpen) {
        reveal()
        return
      }
      if (travel === 0) return

      const nextDirection = Math.sign(travel)
      if (nextDirection !== direction) pendingTravel = 0
      direction = nextDirection
      const totalHeight = search.offsetHeight + filters.offsetHeight
      const leavingEdge =
        (offset === 0 && travel > 0) || (offset === totalHeight && travel < 0)
      let movement = travel
      if (leavingEdge) {
        pendingTravel += Math.abs(travel)
        movement = direction * Math.max(0, pendingTravel - SCROLL_THRESHOLD)
        if (movement === 0) return
      }
      pendingTravel = 0
      applyOffset(offset + movement)
    }

    const onScroll = (event: Event) => {
      // Capture the iOS Page container as well as normal document scrolling,
      // but ignore horizontal filter strips and scrollable popover panels.
      const target = event.target
      if (target !== document && target !== pageScroller()) return
      if (frame === undefined) frame = requestAnimationFrame(update)
    }
    const onFocus = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        (searchRef.current?.contains(event.target) ||
          filtersRef.current?.contains(event.target))
      ) {
        reveal()
        lastY = scrollPosition()
        previousGap = gapBeforePinning()
      }
    }

    // Header sizes can change with zoom, orientation, or filter labels.
    const observer = new ResizeObserver(() => {
      reveal()
      lastY = scrollPosition()
      previousGap = gapBeforePinning()
    })
    observer.observe(search)
    observer.observe(filters)

    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    })
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('focusin', onFocus)
      if (frame !== undefined) cancelAnimationFrame(frame)
      observer.disconnect()
      for (const element of [search, filters]) {
        element.style.removeProperty('transform')
        element.style.removeProperty('pointer-events')
        element.removeAttribute('inert')
        element.removeAttribute('aria-hidden')
      }
    }
  }, [enabled, searchRef, filtersRef])
}
