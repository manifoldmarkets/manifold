import { useState, useEffect, MutableRefObject } from 'react'

export const useIntersection = (
  element: MutableRefObject<Element | null>,
  rootMargin: string,
  rootRef: MutableRefObject<Element | null>
) => {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    if (rootRef.current) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          setIsVisible(entry.isIntersecting)
        },
        { rootMargin, root: rootRef.current }
      )
      element.current && observer.observe(element.current)

      return () => {
        if (element.current) {
          observer.unobserve(element.current)
        }
      }
    }
  }, [element.current, rootMargin, rootRef.current])

  return isVisible
}
