import { useApiSubscription } from './use-api-subscription'

import { ContractComment } from 'common/comment'
import { useState } from 'react'
import { orderBy, uniqBy } from 'lodash'
import { unauthedApi } from 'common/util/api'

export function useSubscribeNewComments(contractId: string) {
  const [comments, setComments] = useState<ContractComment[]>([])

  useApiSubscription({
    topics: [`contract/${contractId}/new-comment`],
    getSnapshot: async (signal) => {
      const result = await unauthedApi(
        'comments',
        { contractId },
        { cache: 'no-store', signal }
      )
      return () => setComments(result)
    },
    onBroadcast: (msg) => {
      const newComment = msg.data.comment as ContractComment
      setComments((prevComments) =>
        orderBy(
          uniqBy([...prevComments, newComment], 'id'),
          'createdTime',
          'desc'
        )
      )
    },
  })

  return comments
}
