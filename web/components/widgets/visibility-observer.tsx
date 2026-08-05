import { useEffect, useRef, useState } from 'react'
import { useEvent } from 'client-common/hooks/use-event'

export function VisibilityObserver(props: {
  className?: string
  onVisibilityUpdated: (visible: boolean) => void
}) {
  const { className } = props
  const [elem, setElem] = useState<HTMLElement | null>(null)
  const onVisibilityUpdated = useEvent(props.onVisibilityUpdated)

  useEffect(() => {
    if (elem) {
      const observer = new IntersectionObserver(([entry]) => {
        onVisibilityUpdated(entry.isIntersecting)
      }, {})
      observer.observe(elem)
      return () => observer.unobserve(elem)
    }
  }, [elem, onVisibilityUpdated])

  return <div ref={setElem} className={className}></div>
}

export function LoadMoreUntilNotVisible(props: {
  // Returns true if there are more results.
  loadMore: () => Promise<boolean>
}) {
  const { loadMore } = props
  const isVisibleRef = useRef(false)
  const loadMoreIfVisible = useEvent(async () => {
    if (isVisibleRef.current && loadMore) {
      const hasMoreResults = await loadMore()
      if (hasMoreResults) {
        setTimeout(() => {
          if (isVisibleRef.current) {
            loadMoreIfVisible()
          }
        }, 500)
      }
    }
  })

  const onVisibilityUpdated = useEvent((visible: boolean) => {
    isVisibleRef.current = visible
    loadMoreIfVisible()
  })

  return (
    <div className="relative">
      <VisibilityObserver
        // Prefetch ~2 screens of content ahead of the viewport so the appended
        // page lands off-screen. Otherwise, on a slow connection the user scrolls
        // to the bottom before the page arrives, and inserting it shoves the
        // in-viewport footer/skeleton down — a major source of feed CLS.
        className="pointer-events-none absolute bottom-0 h-[200vh] w-full select-none"
        onVisibilityUpdated={onVisibilityUpdated}
      />
    </div>
  )
}
