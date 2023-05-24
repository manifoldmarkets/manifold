import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'

export function useRealtimeContractFollows(contractId: string) {
  const { rows } = useSubscription('contract_follows', {
    k: 'contract_id',
    v: contractId,
  })
  return rows?.map((r) => r.follow_id)
}
