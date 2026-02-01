import clsx from 'clsx'
import { memo, useState } from 'react'

import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { Repost } from 'common/repost'
import { User } from 'common/user'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { RepostFeedCard } from 'web/components/feed/repost-feed-card'

export const UnifiedFeedCard = memo(function UnifiedFeedCard(props: {
  contract: Contract
  repost: Repost | undefined
  comment: ContractComment | undefined
  bet: Bet | undefined
  user: User | undefined | null
  reason: string
}) {
  const { contract, reason, user, repost, comment, bet } = props
  const [hidden, setHidden] = useState(false)

  if (hidden) {
    return (
      <Col
        className={clsx(
          'bg-canvas-0 border-canvas-0 rounded-xl border drop-shadow-md'
        )}
      >
        <Row className={'text-ink-400 mb-4 px-4 pt-3 text-sm'}>
          <i>Market hidden</i>
        </Row>
      </Col>
    )
  }

  // Repost card with comment
  if (repost && comment) {
    return (
      <RepostFeedCard
        contract={contract}
        comment={comment}
        repost={repost}
        trackingLocation={'feed'}
        bet={bet}
        user={user}
        hide={() => setHidden(true)}
      />
    )
  }

  // Regular contract card
  return (
    <FeedContractCard
      trackingPostfix={'feed'}
      contract={contract}
      key={contract.id}
      hide={() => setHidden(true)}
      feedReason={reason}
    />
  )
})
