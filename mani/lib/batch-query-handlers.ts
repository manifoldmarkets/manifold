import { BatchQueryParams } from 'client-common/hooks/use-batched-getter'
import { api } from './api'

export const queryHandlers = {
  markets: async ({ ids }: BatchQueryParams) => {
    return await api('markets-by-ids', { ids: Array.from(ids) })
  },
  user: async ({ ids }: BatchQueryParams) => {
    return await api('users/by-id', { ids: Array.from(ids) })
  },
  'comment-reactions': async ({ ids }: BatchQueryParams) => {
    const reactionsData = await api('comment-reactions', {
      contentIds: Array.from(ids),
      contentType: 'comment',
    })
    return reactionsData
  },
}
