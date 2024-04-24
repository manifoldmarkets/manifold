import { useRealtimeBetsPolling } from './use-bets-supabase'

export const useUserContractBets = (
  userId: string | undefined,
  contractId: string
) => {
  const bets = useRealtimeBetsPolling(
    { contractId, userId },
    userId ? 5_000 : Infinity,
    `user-bets-${userId}-${contractId}`
  )

  return bets
}
