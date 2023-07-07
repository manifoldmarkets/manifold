import clsx from 'clsx'
import { AD_PERIOD, AD_REDEEM_REWARD } from 'common/boost'
import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import Link from 'next/link'
import {
  DislikeButton,
  FeedContractCard,
} from 'web/components/contract/feed-contract-card'
import { mergePeriodic } from 'web/components/feed/feed-items'
import { Col } from 'web/components/layout/col'
import { groupCommentsByContractsAndParents } from 'web/hooks/use-additional-feed-items'
import { useUnseenReplyChainCommentsOnContracts } from 'web/hooks/use-comments-supabase'
import { BoostsType } from 'web/hooks/use-feed'
import {
  FeedTimelineItem,
  shouldIgnoreCommentsOnContract,
} from 'web/hooks/use-feed-timeline'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { db } from 'web/lib/supabase/db'
import { ContractsTable } from '../contract/contracts-table'
import { NewsArticle } from '../news/news-article'
import { FeedBetsItem } from './feed-bet-item'
import { FeedCommentItem } from './feed-comment-item'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { track } from 'web/lib/service/analytics'
import React, { useState } from 'react'
import { Row } from 'web/components/layout/row'

const MAX_PARENT_COMMENTS_PER_FEED_ITEM = 1
export const MIN_BET_AMOUNT = 20

export const FeedTimelineItems = (props: {
  feedTimelineItems: FeedTimelineItem[]
  boosts?: BoostsType
  manualContracts?: Contract[]
  user: User | null | undefined
}) => {
  const {
    user,
    manualContracts,
    boosts,
    feedTimelineItems: savedFeedTimelineItems,
  } = props
  const savedFeedComments = filterDefined(
    savedFeedTimelineItems.map((item) => item.comments)
  ).flat()

  const boostedContractItems =
    boosts?.map((boost) => {
      const { market_data, ...rest } = boost
      return { contract: { ...market_data }, ...rest }
    }) ?? []

  const contractIdsWithoutComments = filterDefined(
    savedFeedTimelineItems.map((item) =>
      item.contract?.id &&
      !item.comments &&
      !shouldIgnoreCommentsOnContract(item.contract)
        ? item.contractId
        : null
    )
  )

  const recentComments = useUnseenReplyChainCommentsOnContracts(
    contractIdsWithoutComments,
    user?.id ?? '_'
  )

  const { parentCommentsByContractId, childCommentsByParentCommentId } =
    groupCommentsByContractsAndParents(savedFeedComments.concat(recentComments))

  const feedTimelineItems = mergePeriodic(
    savedFeedTimelineItems,
    boostedContractItems,
    AD_PERIOD
  )

  return (
    <Col className="gap-6">
      {feedTimelineItems.map((item) => {
        if (item.contract && ('ad_id' in item || 'contract' in item)) {
          const { contract } = item
          // Boosted contract
          if ('ad_id' in item) {
            return (
              <FeedContractAndRelatedItems
                user={user}
                contract={contract}
                promotedData={{
                  adId: item.ad_id,
                  reward: AD_REDEEM_REWARD,
                }}
                parentComments={[]}
                childCommentsByParentCommentId={{}}
                keyPrefix={'ad-'}
              />
            )
          }
          const parentComments = (
            item.comments ??
            parentCommentsByContractId[contract.id] ??
            []
          ).slice(0, MAX_PARENT_COMMENTS_PER_FEED_ITEM)
          // Organic contract
          return (
            <FeedContractAndRelatedItems
              user={user}
              contract={contract}
              parentComments={parentComments}
              childCommentsByParentCommentId={childCommentsByParentCommentId}
              item={item}
            />
          )
        } else if ('news' in item && item.news) {
          const { news } = item
          return (
            <FeedItemFrame
              item={item}
              key={news.id + 'feed-timeline-item'}
              className="bg-canvas-0 border-canvas-0 hover:border-primary-300 w-full overflow-hidden rounded-2xl border drop-shadow-md "
            >
              <NewsArticle
                author={(news as any)?.author}
                published_time={(news as any)?.published_time}
                {...news}
              />
              {item.contracts && (
                <Col className="px-4 pt-2 pb-3">
                  <span className="text-ink-500 text-sm">
                    Related Questions
                  </span>
                  <ContractsTable
                    contracts={item.contracts}
                    hideHeader={true}
                  />
                </Col>
              )}
            </FeedItemFrame>
          )
        }
      })}
      {manualContracts?.map((contract) => (
        <FeedContractAndRelatedItems
          user={user}
          contract={contract}
          parentComments={[]}
          childCommentsByParentCommentId={{}}
          keyPrefix={'manual-'}
        />
      ))}
    </Col>
  )
}

const FeedContractAndRelatedItems = (props: {
  contract: Contract
  user: User | null | undefined
  parentComments: ContractComment[]
  childCommentsByParentCommentId: Record<string, ContractComment[]>
  groupedBetsByTime?: Bet[][]
  item?: FeedTimelineItem
  promotedData?: { adId: string; reward: number }
  keyPrefix?: string
}) => {
  const {
    contract,
    promotedData,
    item,
    groupedBetsByTime,
    childCommentsByParentCommentId,
    parentComments,
    keyPrefix,
    user,
  } = props
  const hasRelatedItems =
    parentComments.length > 0 || (groupedBetsByTime ?? []).length > 0
  const [hidden, setHidden] = useState(false)

  return (
    <FeedItemFrame
      item={item}
      key={keyPrefix + contract.id + '-feed-timeline-item-' + item?.id}
      className={'relative'}
    >
      {!hidden ? (
        <FeedContractCard
          contract={contract}
          promotedData={promotedData}
          trackingPostfix="feed"
          children={
            hasRelatedItems ? (
              <>
                {parentComments.length > 0 && (
                  <FeedCommentItem
                    contract={contract}
                    commentThreads={parentComments.map((parentComment) => ({
                      parentComment,
                      childComments:
                        childCommentsByParentCommentId[parentComment.id] ?? [],
                    }))}
                  />
                )}
                {(!parentComments || parentComments.length === 0) &&
                  groupedBetsByTime?.length && (
                    <FeedBetsItem
                      contract={contract}
                      groupedBets={groupedBetsByTime}
                    />
                  )}
              </>
            ) : undefined
          }
          item={item}
        />
      ) : (
        <Col
          className={clsx(
            'bg-canvas-0 border-canvas-0 rounded-xl border drop-shadow-md'
          )}
        >
          <Row className={'text-ink-400 mb-10 px-4 pt-3 text-sm'}>
            <i>Market hidden</i>
          </Row>
        </Col>
      )}
      <DislikeButton
        className={'absolute bottom-2.5 left-4'}
        user={user}
        contract={contract}
        item={item}
        interesting={!hidden}
        toggleInteresting={() => setHidden(!hidden)}
      />
    </FeedItemFrame>
  )
}

const FeedItemFrame = (props: {
  item: FeedTimelineItem | undefined
  children: React.ReactNode
  className?: string
}) => {
  const { item, children, className } = props

  const maybeVisibleHook = useIsVisible(
    () =>
      // TODO: should we keep updating them or just do it once?
      item &&
      run(
        db
          .from('user_feed')
          .update({ seen_time: new Date().toISOString() })
          .eq('id', item.id)
      ).then(() =>
        track('view feed item', { id: item.id, type: item.dataType })
      ),
    true,
    item !== undefined
  )

  return (
    <Col ref={maybeVisibleHook?.ref} className={className}>
      {children}
    </Col>
  )
}
