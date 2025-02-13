import { useApiSubscription } from './use-api-subscription'

import { ContractComment } from 'common/comment'
import { useState } from 'react'
import { orderBy, uniqBy } from 'lodash'

export function useSubscribeNewComments(contractId: string) {
  const [comments, setComments] = useState<ContractComment[]>([])

  useApiSubscription({
    topics: [`contract/${contractId}/new-comment`],
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
