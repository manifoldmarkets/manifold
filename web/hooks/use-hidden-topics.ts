import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export const useHiddenTopics = () => {
  const [hidePolitics, setHidePolitics] = usePersistentLocalState(
    false,
    'hide-politics'
  )
  const [hideSports, setHideSports] = usePersistentLocalState(
    false,
    'hide-sports'
  )
  return {
    hideSports,
    setHideSports,
    hidePolitics,
    setHidePolitics,
  }
}
