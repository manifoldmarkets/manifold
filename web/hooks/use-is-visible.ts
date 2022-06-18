import { useEffect, useState } from 'react'

export function useIsVisible(element: HTMLElement | null) {
  return !!useIntersectionObserver(element)?.isIntersecting
}

function useIntersectionObserver(
  elem: HTMLElement | null
): IntersectionObserverEntry | undefined {
  const [entry, setEntry] = useState<IntersectionObserverEntry>()

  const updateEntry = ([entry]: IntersectionObserverEntry[]): void => {
    setEntry(entry)
  }

  useEffect(() => {
    const hasIOSupport = !!window.IntersectionObserver

    if (!hasIOSupport || !elem) return

    const observer = new IntersectionObserver(updateEntry, {})
    observer.observe(elem)

    return () => observer.disconnect()
  }, [elem])

  return entry
}
