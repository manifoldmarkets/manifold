import { useEffect, useState } from 'react'

export function inIframe() {
  try {
    return window.self !== window.top
  } catch (e) {
    return true
  }
}

// use a hook so this calculation happens client side
export function useInIframe() {
  const [isIn, setIsIn] = useState(false)
  useEffect(() => setIsIn(inIframe()), [])
  return isIn
}
