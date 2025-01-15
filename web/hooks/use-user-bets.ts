import { useContractBets } from 'client-common/hooks/use-bets'
import { removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/api/api'
import { useIsPageVisible } from './use-page-visible'

export const useUserContractBets = (
  userId: string | undefined,
  contractId: string
) => {
  return useContractBets(
    contractId,
    removeUndefinedProps({
      userId,
      enabled: !!userId,
    }),
    useIsPageVisible,
    (params) => api('bets', params)
  )
}
