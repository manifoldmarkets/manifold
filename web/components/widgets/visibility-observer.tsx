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
      let active = true
      const observer = new IntersectionObserver(([entry]) => {
        if (active) onVisibilityUpdated(entry.isIntersecting)
      }, {})
      observer.observe(elem)
      return () => {
        active = false
        observer.disconnect()
      }
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
  const cycleRef = useRef<{
    active: boolean
    loading: boolean
    timer?: ReturnType<typeof setTimeout>
  }>({ active: false, loading: false })

  useEffect(() => {
    // Keep each effect lifetime separate, including StrictMode's setup replay.
    // A request from an older lifetime must never schedule another page.
    const cycle: typeof cycleRef.current = { active: true, loading: false }
    cycleRef.current = cycle
    return () => {
      cycle.active = false
      isVisibleRef.current = false
      clearTimeout(cycle.timer)
    }
  }, [])

  const loadMoreIfVisible = useEvent(async () => {
    const cycle = cycleRef.current
    if (
      !cycle.active ||
      !isVisibleRef.current ||
      cycle.loading ||
      cycle.timer !== undefined
    )
      return
    cycle.loading = true
    try {
      const hasMoreResults = await loadMore()
      if (cycle.active && isVisibleRef.current && hasMoreResults) {
        cycle.timer = setTimeout(() => {
          cycle.timer = undefined
          if (cycle.active) loadMoreIfVisible()
        }, 500)
      }
    } finally {
      cycle.loading = false
    }
  })

  const onVisibilityUpdated = useEvent((visible: boolean) => {
    isVisibleRef.current = visible
    if (!visible) {
      clearTimeout(cycleRef.current.timer)
      cycleRef.current.timer = undefined
    }
    loadMoreIfVisible()
  })

  return (
    <div className="relative">
      <VisibilityObserver
        // Loads more as soon as one screen height of content is left.
        className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
        onVisibilityUpdated={onVisibilityUpdated}
      />
    </div>
  )
}
