import { useCallback, useRef } from 'react'

export function useEvent<T extends (...args: any[]) => any>(handler: T): T {
  const handlerRef = useRef<T>()

  // Update ref each render to maintain closure over new props/state
  handlerRef.current = handler

  // Return stable function that delegates to latest handler
  return useCallback((...args: Parameters<T>) => {
    const fn = handlerRef.current
    if (fn) {
      return fn(...args)
    }
  }, []) as T
}
