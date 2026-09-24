import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useUser } from 'web/hooks/use-user'

// "Hide API trades" filters start from the user's account setting. Flipping one
// overrides the setting for that view only, kept in memory like the other trade
// filters, so it resets to the setting on reload.
export const useHideApiTrades = (key: string) => {
  const user = useUser()
  const [override, setOverride] = usePersistentInMemoryState<
    boolean | undefined
  >(undefined, key)
  const hideApiTrades = override ?? !!user?.hideApiTradesByDefault
  return [hideApiTrades, setOverride] as const
}
