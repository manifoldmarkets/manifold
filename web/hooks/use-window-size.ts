import { useEffect, useState } from 'react'

export const useWindowSize = () => {
  const [size, setSize] = useState<{
    width: number | undefined
    height: number | undefined
  }>({ width: undefined, height: undefined })

  useEffect(() => {
    const onResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }

    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}
