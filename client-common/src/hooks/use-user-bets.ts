import { useContractBets } from 'client-common/hooks/use-bets'
import { APIParams, APIResponse } from 'common/api/schema'
import { removeUndefinedProps } from 'common/util/object'

export const useUserContractBets = (
  userId: string | undefined,
  contractId: string,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>,
  useIsPageVisible: () => boolean
) => {
  return useContractBets(
    contractId,
    removeUndefinedProps({
      userId,
      enabled: !!userId,
    }),
    useIsPageVisible,
    api
  )
}
