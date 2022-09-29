import { RefObject, useState, useEffect } from 'react'

// todo: consider consolidation with use-measure-size
export const useElementWidth = <T extends Element>(ref: RefObject<T>) => {
  const [width, setWidth] = useState<number>()
  useEffect(() => {
    const handleResize = () => {
      setWidth(ref.current?.clientWidth)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [ref])
  return width
}
