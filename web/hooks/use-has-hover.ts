import { useEffect, useState } from 'react'

// True on devices with a pointer that can genuinely hover (desktop with a
// mouse), false on touch devices (phones/tablets). iOS *emulates* hover on tap:
// the first tap fires mouseenter and is treated as a hover-reveal, swallowing
// the click. Hover-driven UI (e.g. the elections map, which shows a state's
// detail panel on hover) then appears without the click ever registering, so
// buttons inside that panel don't work. Gating hover behavior on this hook lets
// touch devices fall back to plain tap-to-select, which fires reliably.
export function useHasHover() {
  // Default to true so SSR / first paint matches desktop; corrected on mount
  // before any hover interaction can happen.
  const [hasHover, setHasHover] = useState(true)
  useEffect(() => {
    const mql = window.matchMedia('(hover: hover)')
    const update = () => setHasHover(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  return hasHover
}
