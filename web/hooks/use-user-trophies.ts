import { prepopulateCache } from 'client-common/hooks/use-api-getter'
import { APIResponse } from 'common/api/schema'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export type UserTrophies = APIResponse<'get-user-trophies'>

// One user's claimed milestones and profile pins, shared by the Trophies tab
// and the profile showcase. `update` also replaces the cached response, so a
// component that mounts later does not bring back the state before a claim.
export function useUserTrophies(userId: string) {
  const props = { userId }
  const { data, setData } = useAPIGetter(
    'get-user-trophies',
    props,
    undefined,
    `get-user-trophies-${userId}`
  )
  const update = (next: UserTrophies) => {
    prepopulateCache('get-user-trophies', props, next)
    setData(next)
  }
  return { trophies: data, update }
}
