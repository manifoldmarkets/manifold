import { api } from 'web/lib/firebase/api'

export const getSeenContractIds = async (
  contractIds: string[],
  since: number,
  types?: ('card' | 'page' | 'promoted')[]
) => {
  return await api('get-seen-market-ids', {
    since,
    types,
    contractIds,
  })
}
