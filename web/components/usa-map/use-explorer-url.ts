import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import {
  DEFAULT_MODE,
  explorerSearch,
  ExplorerMode,
  parseExplorerQuery,
} from './explorer-url'

// Keeps `?office=&race=` in step with the explorer on /election, both ways:
// a link (including one from elsewhere on the page) opens that tab and race,
// and switching tabs or opening/closing a race replaces the URL shallowly,
// without scrolling or adding history entries.
//
// `apply` takes the URL's state and returns the race it accepted (unknown
// ids are dropped), so the URL is only rewritten from settled state.
export function useExplorerUrl(props: {
  mode: ExplorerMode
  race: string | undefined
  apply: (mode: ExplorerMode, race: string | undefined) => string | undefined
}) {
  const { mode, race, apply } = props
  const router = useRouter()
  const enabled = router.pathname.startsWith('/election')
  const ready = enabled && router.isReady
  const applyRef = useRef(apply)
  applyRef.current = apply
  // State requested by the URL that the explorer has not rendered yet.
  const target = useRef<{ mode: ExplorerMode; race?: string }>()
  const lastWritten = useRef<string>()
  const inFlight = useRef(0)
  const { office: officeParam, race: raceParam } = router.query

  // URL → state: on load, and when anything other than this hook changes it.
  useEffect(() => {
    if (!ready || inFlight.current > 0) return
    const search = window.location.search
    if (search === lastWritten.current) return
    const parsed = parseExplorerQuery({ office: officeParam, race: raceParam })
    const nextMode = parsed.mode ?? DEFAULT_MODE
    const accepted = applyRef.current(nextMode, parsed.race)
    target.current = { mode: nextMode, race: accepted }
    lastWritten.current = search
  }, [ready, officeParam, raceParam])

  // State → URL, once the state the URL asked for has rendered.
  useEffect(() => {
    if (!ready) return
    if (target.current) {
      if (target.current.mode !== mode || target.current.race !== race) return
      target.current = undefined
      return
    }
    const search = explorerSearch(window.location.search, mode, race)
    if (search === window.location.search) {
      lastWritten.current = search
      return
    }
    lastWritten.current = search
    inFlight.current++
    router
      .replace(
        `${window.location.pathname}${search}${window.location.hash}`,
        undefined,
        { shallow: true, scroll: false }
      )
      .catch(() => false)
      .finally(() => {
        inFlight.current--
      })
  }, [ready, mode, race])
}
