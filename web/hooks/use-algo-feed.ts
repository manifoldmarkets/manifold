import { useState, useEffect } from 'react'
import type { feed } from 'common/feed'
import { useTimeSinceFirstRender } from './use-time-since-first-render'
import { trackLatency } from 'web/lib/firebase/tracking'
import { User } from 'common/user'
import { getCategoryFeeds, getUserFeed } from 'web/lib/firebase/users'
import {
  getRecentBetsAndComments,
  getTopWeeklyContracts,
} from 'web/lib/firebase/contracts'

export const useAlgoFeed = (
  user: User | null | undefined,
  category: string
) => {
  const [allFeed, setAllFeed] = useState<feed>()
  const [categoryFeeds, setCategoryFeeds] = useState<{ [x: string]: feed }>()

  const getTime = useTimeSinceFirstRender()

  useEffect(() => {
    if (user) {
      getUserFeed(user.id).then((feed) => {
        if (feed.length === 0) {
          getDefaultFeed().then((feed) => setAllFeed(feed))
        } else setAllFeed(feed)

        trackLatency('feed', getTime())
        console.log('"all" feed load time', getTime())
      })

      getCategoryFeeds(user.id).then((feeds) => {
        setCategoryFeeds(feeds)
        console.log('category feeds load time', getTime())
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const feed = category === 'all' ? allFeed : categoryFeeds?.[category]

  return feed
}

const getDefaultFeed = async () => {
  const contracts = await getTopWeeklyContracts()
  const feed = await Promise.all(
    contracts.map((c) => getRecentBetsAndComments(c))
  )
  return feed
}
