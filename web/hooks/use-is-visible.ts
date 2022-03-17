import { RefObject, useEffect, useState } from 'react'

export function useIsVisible(elementRef: RefObject<Element>) {
  return !!useIntersectionObserver(elementRef)?.isIntersecting
}

function useIntersectionObserver(
  elementRef: RefObject<Element>
): IntersectionObserverEntry | undefined {
  const [entry, setEntry] = useState<IntersectionObserverEntry>()

  const updateEntry = ([entry]: IntersectionObserverEntry[]): void => {
    setEntry(entry)
  }

  useEffect(() => {
    const node = elementRef?.current
    const hasIOSupport = !!window.IntersectionObserver

    if (!hasIOSupport || !node) return

    const observer = new IntersectionObserver(updateEntry, {})
    observer.observe(node)

    return () => observer.disconnect()
  }, [elementRef])

  return entry
}
