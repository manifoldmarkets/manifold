import { useEffect, useState } from 'react'

export const useWindowSize = () => {
  const [size, setSize] = useState(
    typeof window === 'undefined'
      ? { width: undefined, height: undefined }
      : { width: window.innerWidth, height: window.innerHeight }
  )

  useEffect(() => {
    const onResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}
