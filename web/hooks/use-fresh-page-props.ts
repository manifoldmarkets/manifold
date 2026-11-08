import { useEffect, useRef, useState } from 'react'

import { useIsPageVisible } from './use-page-visible'

// An ISR page's props, kept fresh in an open tab. Its server props are
// rebuilt on `revalidate`, but a tab keeps the ones it loaded; while the tab
// is visible this refetches them every `intervalMs` from the same JSON a
// client-side navigation to the page loads (/_next/data/<build>/<path>.json),
// and returns the newest. A failed fetch keeps the last props. (Reloading
// through the router doesn't do it: with a #section in the URL, Next treats
// the same URL as a hash-only change and only scrolls.)
export function useFreshPageProps<P extends object>(
  initial: P,
  dataPath: string,
  intervalMs: number
): P {
  const [props, setProps] = useState(initial)
  // When the props in hand were fetched (the page load, at first).
  const fetchedAt = useRef(Date.now())
  useEffect(() => setProps(initial), [initial])
  const visible = useIsPageVisible()
  useEffect(() => {
    if (!visible) return
    const next = (window as { __NEXT_DATA__?: { buildId?: string } })
      .__NEXT_DATA__
    const buildId = next?.buildId
    if (!buildId) return
    let cancelled = false
    const refresh = async () => {
      try {
        const r = await fetch(`/_next/data/${buildId}${dataPath}.json`)
        if (!r.ok) return
        const json = (await r.json()) as { pageProps?: P }
        if (!cancelled && json.pageProps) {
          fetchedAt.current = Date.now()
          setProps(json.pageProps)
        }
      } catch {
        // Offline or a new deploy: keep what we have.
      }
    }
    // A tab coming back after a while starts from fresh props.
    if (Date.now() - fetchedAt.current >= intervalMs) refresh()
    const timer = setInterval(refresh, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [visible, dataPath, intervalMs])
  return props
}
