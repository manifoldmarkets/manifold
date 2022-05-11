import _, { Dictionary } from 'lodash'
import { useState, useEffect } from 'react'
import type { feed } from 'common/feed'
import { useTimeSinceFirstRender } from './use-time-since-first-render'
import { trackLatency } from 'web/lib/firebase/tracking'
import { User } from 'common/user'
import { getCategoryFeeds, getUserFeed } from 'web/lib/firebase/users'
import { useUpdatedContracts } from './use-contracts'
import {
  getRecentBetsAndComments,
  getTopWeeklyContracts,
} from 'web/lib/firebase/contracts'

export const useAlgoFeed = (user: User | null | undefined) => {
  const [feed, setFeed] = useState<feed>()
  const [categoryFeeds, setCategoryFeeds] = useState<Dictionary<feed>>()

  const getTime = useTimeSinceFirstRender()

  useEffect(() => {
    if (user) {
      getUserFeed(user.id).then((feed) => {
        if (feed.length === 0) {
          getDefaultFeed().then((feed) => setFeed(feed))
        } else setFeed(feed)

        trackLatency('feed', getTime())
        console.log('feed load time', getTime())
      })

      getCategoryFeeds(user.id).then((feeds) => {
        setCategoryFeeds(feeds)
        console.log('category feeds load time', getTime())
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const followedCategory = user?.followedCategories?.[0] ?? 'all'

  const followedFeed =
    followedCategory === 'all' ? feed : categoryFeeds?.[followedCategory]

  return followedFeed
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

const getDefaultFeed = async () => {
  const contracts = await getTopWeeklyContracts()
  const feed = await Promise.all(
    contracts.map((c) => getRecentBetsAndComments(c))
  )
  return feed
}
