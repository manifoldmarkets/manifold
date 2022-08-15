import { useEffect, useState } from 'react'
import { useEvent } from '../hooks/use-event'

export function VisibilityObserver(props: {
  className?: string
  onVisibilityUpdated: (visible: boolean) => void
}) {
  const { className } = props
  const [elem, setElem] = useState<HTMLElement | null>(null)
  const onVisibilityUpdated = useEvent(props.onVisibilityUpdated)

  useEffect(() => {
    const hasIOSupport = !!window.IntersectionObserver
    if (!hasIOSupport || !elem) return

    const observer = new IntersectionObserver(([entry]) => {
      onVisibilityUpdated(entry.isIntersecting)
    }, {})
    observer.observe(elem)
    return () => observer.disconnect()
  }, [elem, onVisibilityUpdated])

  return <div ref={setElem} className={className}></div>
}
