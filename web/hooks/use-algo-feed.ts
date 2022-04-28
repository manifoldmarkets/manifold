import _ from 'lodash'
import { useState, useEffect } from 'react'
import { Bet } from '../../common/bet'
import { Comment } from '../../common/comment'
import { Contract } from '../../common/contract'
import { useTimeSinceFirstRender } from './use-time-since-first-render'
import { trackLatency } from '../lib/firebase/tracking'
import { getFeed } from '../lib/firebase/api-call'

export const useAlgoFeed = () => {
  const [feed, setFeed] = useState<
    {
      contract: Contract
      recentBets: Bet[]
      recentComments: Comment[]
    }[]
  >()

  const getTime = useTimeSinceFirstRender()

  useEffect(() => {
    getFeed().then(({ data }) => {
      console.log('got data', data)
      setFeed(data.feed)

      trackLatency('feed', getTime())
      console.log('feed load time', getTime())
    })
  }, [getTime])

  return feed
}
