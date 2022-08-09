import { useEffect, useState } from 'react'

export function VisibilityObserver(props: {
  className?: string
  onVisibilityUpdated: (visible: boolean) => void
}) {
  const { className, onVisibilityUpdated } = props
  const [elem, setElem] = useState<HTMLElement | null>(null)

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
