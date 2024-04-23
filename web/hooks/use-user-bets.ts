import { useRealtimeBetsPolling } from './use-bets-supabase'

export const useUserContractBets = (
  userId: string | undefined,
  contractId: string | undefined
) => {
  const bets = !contractId
    ? undefined
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useRealtimeBetsPolling(
        { contractId, userId },
        5_000,
        `user-bets-${userId}-${contractId}`
      )

  return bets
}
