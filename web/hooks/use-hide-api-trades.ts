import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useEffect } from 'react'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'

// Saves run one at a time in click order, so quick toggling can't leave the
// account on an earlier click.
let saving: Promise<unknown> = Promise.resolve()

// Every "Hide API trades" toggle shares one value. For signed-in users it's
// saved to their account, and me/update broadcasts the change to their open
// tabs, so it sticks across markets, tabs, devices and reloads. Signed-out
// users keep it in memory until they reload.
export const useHideApiTrades = () => {
  const user = useUser()
  const saved = !!user?.hideApiTrades
  // This tab's last click, shown until the account value catches up with it.
  // It only counts for whoever made it, so after signing in the account's
  // value wins.
  const [click, setClick] = usePersistentInMemoryState<
    { userId?: string; value: boolean } | undefined
  >(undefined, 'hide-api-trades')
  const clicked = click?.userId === user?.id ? click?.value : undefined

  // Only a change to the account value clears the click, so a quick on/off
  // doesn't flicker while its saves come back. Once cleared, changes made in
  // other tabs show through.
  useEffect(() => {
    if (user && clicked === saved) setClick(undefined)
  }, [saved])

  const setHideApiTrades = useEvent((enabled: boolean) => {
    setClick({ userId: user?.id, value: enabled })
    if (user)
      saving = saving
        .then(() => api('me/update', { hideApiTrades: enabled }))
        .catch(() => {})
  })

  return [clicked ?? saved, setHideApiTrades] as const
}
