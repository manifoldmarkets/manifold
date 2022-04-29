import _ from 'lodash'
import { useState, useEffect } from 'react'
import { Bet } from '../../common/bet'
import { Comment } from '../../common/comment'
import { Contract } from '../../common/contract'
import { useTimeSinceFirstRender } from './use-time-since-first-render'
import { trackLatency } from '../lib/firebase/tracking'
import { User } from '../../common/user'
import { getUserFeed } from '../lib/firebase/users'

export const useAlgoFeed = (user: User | null | undefined) => {
  const [feed, setFeed] = useState<
    {
      contract: Contract
      recentBets: Bet[]
      recentComments: Comment[]
    }[]
  >()

  const getTime = useTimeSinceFirstRender()

  useEffect(() => {
    if (user) {
      getUserFeed(user.id).then((feed) => {
        setFeed(feed)

        trackLatency('feed', getTime())
        console.log('feed load time', getTime())
      })
    }
  }, [user, getTime])

  return feed
}
