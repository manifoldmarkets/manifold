import { useEffect, useRef } from 'react'

export function useIsVisible(cb: () => void, once = false, isLoaded = true) {
  const ref = useRef<HTMLDivElement | null>(null)
  const seenOnce = useRef(false)

  useEffect(() => {
    const element = ref.current
    if (!element || !isLoaded) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            cb()
            if (once) {
              observer.unobserve(element)
              seenOnce.current = true
            }
          }
        })
      },
      { threshold: 1 }
    )

    !seenOnce.current && observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [ref, once, cb, isLoaded])

  return { ref }
}
