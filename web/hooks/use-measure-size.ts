import { useCallback, useEffect, useRef, useState } from 'react'
import { useSafeLayoutEffect } from 'client-common/hooks/use-safe-layout-effect'

const getSize = (elem: HTMLElement | null) =>
  elem
    ? { width: elem.clientWidth, height: elem.clientHeight }
    : { width: undefined, height: undefined }

export function useMeasureSize() {
  const elemRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(() => getSize(null))

  const handleResize = useCallback(
    () =>
      setSize((prev) => {
        const next = getSize(elemRef.current)
        return prev.width === next.width && prev.height === next.height
          ? prev
          : next
      }),
    []
  )

  // The measured element may not exist on first render (a chart behind its
  // loading placeholder) and may be swapped out later, so the observer
  // follows the element instead of attaching once at mount. This runs after
  // every render but only does work when the element actually changed, and
  // the size updater bails out on identical sizes, so it cannot loop.
  const observedRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  useSafeLayoutEffect(() => {
    const elem = elemRef.current
    if (elem === observedRef.current) return
    observerRef.current?.disconnect()
    observerRef.current = null
    observedRef.current = elem
    if (!elem) return
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(elem)
    observerRef.current = resizeObserver
  })
  useEffect(() => () => observerRef.current?.disconnect(), [])

  return { elemRef, ...size }
}
