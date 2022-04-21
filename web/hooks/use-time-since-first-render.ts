import { useCallback, useEffect, useRef } from 'react'

export function useTimeSinceFirstRender() {
  const startTimeRef = useRef(0)
  useEffect(() => {
    startTimeRef.current = Date.now()
  }, [])

  return useCallback(() => {
    if (!startTimeRef.current) return 0
    return Date.now() - startTimeRef.current
  }, [])
}
