import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { track } from 'web/lib/service/analytics'

export type BrowseView = 'new' | 'legacy'

export type BrowseViewState = ReturnType<typeof useBrowseView>

// Which browse page this device shows. The redesign is the default; the
// classic page stays one click away and the choice sticks per device.
export function useBrowseView() {
  const [view, setView, ready] = usePersistentLocalState<BrowseView>(
    'new',
    'browse-view'
  )
  const choose = (next: BrowseView) => {
    if (next === view) return
    track('browse view toggle', { view: next })
    setView(next)
    window.scrollTo(0, 0)
  }
  return { view, setView: choose, ready }
}
