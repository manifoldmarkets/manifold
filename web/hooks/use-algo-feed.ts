import _ from 'lodash'
import { useState, useEffect } from 'react'
import { Bet } from '../../common/bet'
import { Comment } from '../../common/comment'
import { Contract } from '../../common/contract'
import { useTimeSinceFirstRender } from './use-time-since-first-render'
import { trackLatency } from '../lib/firebase/tracking'
import { User } from '../../common/user'
import { getUserFeed } from '../lib/firebase/users'
import { useUpdatedContracts } from './use-contracts'

type feed = {
  contract: Contract
  recentBets: Bet[]
  recentComments: Comment[]
}[]

export const useAlgoFeed = (user: User | null | undefined) => {
  const [feed, setFeed] = useState<feed>()

  const getTime = useTimeSinceFirstRender()

  useEffect(() => {
    if (user) {
      getUserFeed(user.id).then((feed) => {
        setFeed(feed)

        trackLatency('feed', getTime())
        console.log('feed load time', getTime())
      })
    }
  }, [user?.id])

  return useUpdateFeed(feed)
}

const useUpdateFeed = (feed: feed | undefined) => {
  const contracts = useUpdatedContracts(feed?.map((item) => item.contract))

  return feed && contracts
    ? feed.map(({ contract, ...other }, i) => ({
        ...other,
        contract: contracts[i],
      }))
    : undefined
}
