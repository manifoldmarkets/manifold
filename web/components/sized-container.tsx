import { ReactNode, useEffect, useRef, useState } from 'react'

export const SizedContainer = (props: {
  fullHeight: number
  mobileHeight: number
  mobileThreshold?: number
  children: (width: number, height: number) => ReactNode
}) => {
  const { children, fullHeight, mobileHeight } = props
  const threshold = props.mobileThreshold ?? 800
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  const [height, setHeight] = useState<number>()
  useEffect(() => {
    if (containerRef.current) {
      const handleResize = () => {
        setHeight(window.innerWidth <= threshold ? mobileHeight : fullHeight)
        setWidth(containerRef.current?.clientWidth)
      }
      handleResize()
      const resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(containerRef.current)
      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
        resizeObserver.disconnect()
      }
    }
  }, [threshold, fullHeight, mobileHeight])
  return (
    <div ref={containerRef}>
      {width != null && height != null && children(width, height)}
    </div>
  )
}
