import { api } from 'web/lib/firebase/api'

export const getSeenContractIds = async (
  contractIds: string[],
  since: number,
  types: ('view market card' | 'view market')[]
) => {
  return await api('get-seen-market-ids', {
    since,
    types,
    contractIds,
  })
}
