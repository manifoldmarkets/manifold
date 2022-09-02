import { useEffect, useRef, useState } from 'react'
import { useEvent } from '../hooks/use-event'

export function VisibilityObserver(props: {
  className?: string
  onVisibilityUpdated: (visible: boolean) => void
}) {
  const { className } = props
  const [elem, setElem] = useState<HTMLElement | null>(null)
  const onVisibilityUpdated = useEvent(props.onVisibilityUpdated)
  const observer = useRef(
    new IntersectionObserver(([entry]) => {
      onVisibilityUpdated(entry.isIntersecting)
    }, {})
  ).current

  useEffect(() => {
    if (elem) {
      observer.observe(elem)
      return () => observer.disconnect()
    }
  }, [elem, observer])

  return <div ref={setElem} className={className}></div>
}
