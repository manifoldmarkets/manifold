import { useEffect, useRef } from 'react'

export function useIsVisible(cb: () => void, once = false) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            cb()
            if (once) {
              observer.unobserve(element)
            }
          }
        })
      },
      { threshold: 1 }
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [ref, once, cb])

  return { ref }
}
