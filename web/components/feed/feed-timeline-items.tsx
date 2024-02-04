import clsx from 'clsx'
import { AD_PERIOD, AD_REDEEM_REWARD } from 'common/boost'
import { User } from 'common/user'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Col } from 'web/components/layout/col'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { Contract } from 'common/contract'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { TopicTag } from 'web/components/topics/topic-tag'
import { BoostsType } from 'web/lib/supabase/ads'
import { FeedRepost } from 'web/components/feed/feed-repost-item'
import { FeedItemFrame } from './feed-item-frame'
import { FeedRelatedContractsGroup } from 'web/components/feed/feed-related-contracts-group'

export const FeedTimelineItems = (props: {
  feedTimelineItems: FeedTimelineItem[]
  boosts?: BoostsType
  user: User | null | undefined
}) => {
  const { user, boosts, feedTimelineItems: savedFeedTimelineItems } = props
  const boostedContractItems =
    boosts?.map((boost) => {
      const { market_data, ...rest } = boost
      return { contract: { ...market_data }, ...rest }
    }) ?? []

  const feedTimelineItems = mergePeriodic(
    savedFeedTimelineItems,
    boostedContractItems,
    AD_PERIOD
  )

  return (
    <>
      {feedTimelineItems.map((item) => {
        if ('manuallyCreatedFromContract' in item && item.contract) {
          return (
            <FeedContractAndRelatedItems
              user={user}
              contract={item.contract}
              key={item.contract.id}
            />
          )
        } else if ('ad_id' in item) {
          // Boosted contract
          const { contract } = item
          return (
            <FeedContractAndRelatedItems
              user={user}
              contract={contract}
              promotedData={{
                adId: item.ad_id,
                reward: AD_REDEEM_REWARD,
              }}
              key={item.ad_id}
            />
          )
        } else if (item.relatedItems) {
          return (
            <FeedRelatedContractsGroup
              item={item}
              key={item.id + '-feed-related-contracts'}
            />
          )
        } else if (item.contract) {
          // Organic contract
          const { contract } = item
          return (
            <FeedContractAndRelatedItems
              user={user}
              contract={contract}
              item={item}
              key={item.id}
            />
          )
        }
      })}
    </>
  )
}

export function CategoryTags(props: {
  categories?: { slug: string; name: string }[]
  className?: string
  maxGroups?: number
}) {
  const { categories, className, maxGroups = 3 } = props
  if (!categories || categories.length <= 0) return null
  return (
    <Row className={clsx(className)}>
      {categories.slice(0, maxGroups).map((category) => (
        <TopicTag location={'feed card'} key={category.slug} topic={category} />
      ))}
    </Row>
  )
}

const FeedContractAndRelatedItems = (props: {
  contract: Contract
  user: User | null | undefined
  item?: FeedTimelineItem
  promotedData?: { adId: string; reward: number }
}) => {
  const { contract, promotedData, item, user } = props
  const [hidden, setHidden] = useState(false)

  return (
    <FeedItemFrame item={item}>
      {hidden ? (
        <Col
          className={clsx(
            'bg-canvas-0 border-canvas-0 rounded-xl border drop-shadow-md'
          )}
        >
          <Row className={'text-ink-400 mb-4 px-4 pt-3 text-sm'}>
            <i>Market hidden</i>
          </Row>
        </Col>
      ) : item?.postId && item.comment ? (
        <FeedRepost
          contract={contract}
          comment={item.comment}
          hide={() => setHidden(true)}
          trackingLocation={'feed'}
          inTimeline={true}
          item={item}
          user={user}
        />
      ) : (
        <FeedContractCard
          contract={contract}
          promotedData={promotedData}
          trackingPostfix="feed"
          hide={() => setHidden(true)}
          item={item}
          className="max-w-full"
        ></FeedContractCard>
      )}
    </FeedItemFrame>
  )
}

// every period items in A, insert an item from B
function mergePeriodic<A, B>(a: A[], b: B[], period: number): (A | B)[] {
  const merged = []
  let j = 0
  for (let i = 0; i < a.length; ++i) {
    merged.push(a[i])
    if ((i + 1) % period === 0 && j < b.length) {
      merged.push(b[j])
      ++j
    }
  }
  return merged
}
