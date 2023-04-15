import { useEffect, useRef, useState } from 'react'
import { useEvent } from '../../hooks/use-event'

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
  className?: string
}) {
  const { loadMore, className } = props
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
    <VisibilityObserver
      className={className}
      onVisibilityUpdated={onVisibilityUpdated}
    />
  )
}
