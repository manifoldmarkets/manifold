import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useEffect } from 'react'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'

// Every "Hide API trades" toggle shares one value. For signed-in users it's
// saved to their account, and me/update broadcasts the change to their open
// tabs, so it sticks across markets, tabs, devices and reloads. Signed-out
// users keep it in memory until they reload.
export const useHideApiTrades = () => {
  const user = useUser()
  const saved = !!user?.hideApiTrades
  // This tab's last click, shown until the account value catches up with it.
  const [clicked, setClicked] = usePersistentInMemoryState<boolean | undefined>(
    undefined,
    'hide-api-trades'
  )

  // Only a change to the account value clears the click, so a quick on/off
  // doesn't flicker while both updates are in flight. Once cleared, changes
  // made in other tabs show through.
  useEffect(() => {
    if (user && clicked === saved) setClicked(undefined)
  }, [saved])

  const setHideApiTrades = useEvent((enabled: boolean) => {
    setClicked(enabled)
    if (user) api('me/update', { hideApiTrades: enabled }).catch(() => {})
  })

  return [clicked ?? saved, setHideApiTrades] as const
}
