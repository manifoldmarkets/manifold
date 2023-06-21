import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'

export function useUninterestedContracts(userId: string) {
  const { rows } = useSubscription('user_disinterests', {
    k: 'user_id',
    v: userId,
  })
  return rows?.map((r) => r.contract_id)
}
