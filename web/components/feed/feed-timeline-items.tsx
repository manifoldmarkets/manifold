import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import {
  groupCommentsByContractsAndParents,
  useFeedBets,
} from 'web/hooks/use-additional-feed-items'
import { User } from 'common/user'
import {
  FeedCommentThread,
  isReplyToBet,
} from 'web/components/feed/feed-comments'
import { SummarizeBets, groupBetsByCreatedTimeAndUserId } from './feed-bets'
import { Bet } from 'common/bet'
import { sumBy } from 'lodash'
import clsx from 'clsx'
import { Row } from '../layout/row'
import { ContractComment } from 'common/comment'
import { BoostsType } from 'web/hooks/use-feed'
import { AD_PERIOD, AD_REDEEM_REWARD } from 'common/boost'
import { mergePeriodic } from 'web/components/feed/feed-items'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { filterDefined } from 'common/util/array'
import { useUnseenReplyChainCommentsOnContracts } from 'web/hooks/use-comments-supabase'
import { ContractMention } from 'web/components/contract/contract-mention'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'

const MAX_BETS_PER_FEED_ITEM = 2
const MAX_PARENT_COMMENTS_PER_FEED_ITEM = 1
export const FeedTimelineItems = (props: {
  feedTimelineItems: FeedTimelineItem[]
  boosts?: BoostsType
  user: User | null | undefined
}) => {
  const { user, boosts, feedTimelineItems: savedFeedTimelineItems } = props
  const savedFeedComments = filterDefined(
    savedFeedTimelineItems.map((item) => item.comments)
  ).flat()

  const boostedContracts =
    boosts?.map((boost) => {
      const { market_data, ...rest } = boost
      return { ...market_data, ...rest, dataType: 'boosted_contract' as const }
    }) ?? []

  const contractIdsWithoutComments = filterDefined(
    savedFeedTimelineItems.map((item) =>
      item.contractId && !item.comments ? item.contractId : null
    )
  ).concat(boostedContracts.map((c) => c.id))

  const recentComments = useUnseenReplyChainCommentsOnContracts(
    contractIdsWithoutComments,
    user?.id ?? '_'
  )

  const { parentCommentsByContractId, childCommentsByParentCommentId } =
    groupCommentsByContractsAndParents(savedFeedComments.concat(recentComments))
  const recentBets = useFeedBets(user, contractIdsWithoutComments)
  const feedTimelineItems = mergePeriodic(
    savedFeedTimelineItems,
    boostedContracts,
    AD_PERIOD
  )

  return (
    <Col>
      {feedTimelineItems.map((item) => {
        // boosted contract or organic feed contract
        if ('contract' in item || item.dataType === 'boosted_contract') {
          const { contract, reasonDescription } =
            item.dataType === 'boosted_contract'
              ? {
                  contract: item,
                  reasonDescription: undefined,
                }
              : item
          if (!contract) return null
          const parentComments = (
            parentCommentsByContractId[contract.id] ?? []
          ).slice(0, MAX_PARENT_COMMENTS_PER_FEED_ITEM)
          const relatedBets = recentBets
            .filter((bet) => bet.contractId === contract.id)
            .slice(0, MAX_BETS_PER_FEED_ITEM)
          const hasItems = parentComments.length > 0 || relatedBets.length > 0

          const promotedData =
            item.dataType === 'boosted_contract'
              ? {
                  adId: item.ad_id,
                  reward: AD_REDEEM_REWARD,
                }
              : undefined

          return (
            <FeedItemFrame
              item={item.dataType !== 'boosted_contract' ? item : undefined}
              key={contract.id + 'feed-timeline-item'}
              className={
                'border-ink-200 my-1 overflow-y-hidden rounded-xl border'
              }
            >
              <FeedContractCard
                contract={contract}
                className={clsx(
                  'my-0 border-0',
                  hasItems ? 'rounded-t-xl rounded-b-none  ' : ''
                )}
                promotedData={promotedData}
                trackingPostfix="feed"
                reason={reasonDescription}
              />
              <Row className="bg-canvas-0">
                <FeedCommentItem
                  contract={contract}
                  commentThreads={parentComments.map((parentComment) => ({
                    parentComment,
                    childComments:
                      childCommentsByParentCommentId[parentComment.id] ?? [],
                  }))}
                />
              </Row>
              <Row className="bg-canvas-0">
                {parentComments.length === 0 && (
                  <FeedBetsItem contract={contract} bets={relatedBets} />
                )}
              </Row>
            </FeedItemFrame>
          )
        } else if ('news' in item && item.news) {
          const { news } = item
          return (
            <FeedItemFrame item={item} key={news.id + 'feed-timeline-item'}>
              {news.title}
              {item.contracts?.map((contract) => (
                <ContractMention
                  contract={contract}
                  key={`news-${news.id}-contract-${contract.id}`}
                />
              ))}
            </FeedItemFrame>
          )
        }
      })}
    </Col>
  )
}

const FeedItemFrame = (props: {
  item: FeedTimelineItem | undefined
  children: React.ReactNode
  className?: string
}) => {
  const { item, children, className } = props
  const maybeVisibleHook =
    item &&
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useIsVisible(
      () =>
        // TODO: should we keep updating them or just do it once?
        run(
          db
            .from('user_feed')
            .update({ seen_time: new Date().toISOString() })
            .eq('id', item.id)
        )
          .then(() => {
            console.log('updated feed item as seen')
          })
          .catch((e) => {
            console.error('failed to update feed item as seen', e)
          }),
      true
    )
  return (
    <Col ref={maybeVisibleHook?.ref} className={className}>
      {children}
    </Col>
  )
}

//TODO: we can't yet respond to summarized bets yet bc we're just combining bets in the feed and
// not combining bet amounts on the backend (where the values are filled in on the comment)
const FeedBetsItem = (props: { contract: Contract; bets: Bet[] }) => {
  const { contract, bets } = props
  const MIN_BET_AMOUNT = 20
  const groupedBetsByTime = groupBetsByCreatedTimeAndUserId(bets).filter(
    (bets) => sumBy(bets, (bet) => Math.abs(bet.amount)) > MIN_BET_AMOUNT
  )
  return (
    <Col>
      {groupedBetsByTime.map((bets, index) => (
        <Row className={'relative w-full p-3'} key={bets[0].id + 'summary'}>
          {index !== groupedBetsByTime.length - 1 ? (
            <div className="border-ink-200 b-[50%] absolute top-0 ml-4 h-[100%] border-l-2" />
          ) : (
            <div className="border-ink-200 absolute top-0 ml-4 h-3 border-l-2" />
          )}
          <SummarizeBets
            betsBySameUser={bets}
            contract={contract}
            avatarSize={'sm'}
          />
        </Row>
      ))}
    </Col>
  )
}
const FeedCommentItem = (props: {
  contract: Contract
  commentThreads: {
    parentComment: ContractComment
    childComments: ContractComment[]
  }[]
}) => {
  const { contract, commentThreads } = props
  const firstCommentIsReplyToBet =
    commentThreads[0] && isReplyToBet(commentThreads[0].parentComment)
  return (
    <Col className={clsx('w-full', firstCommentIsReplyToBet ? 'sm:mt-4' : '')}>
      {commentThreads.map((ct, index) => (
        <Row
          className={'relative w-full'}
          key={ct.parentComment.id + 'feed-thread'}
        >
          {index === 0 && firstCommentIsReplyToBet ? (
            <div />
          ) : index !== commentThreads.length - 1 ? (
            <div className="border-ink-200 b-[50%] absolute top-0 ml-7 h-[100%] border-l-2" />
          ) : (
            <div className="border-ink-200 absolute top-0 ml-7 h-3 border-l-2" />
          )}

          <Col className={'w-full p-3'}>
            <FeedCommentThread
              contract={contract}
              threadComments={ct.childComments}
              parentComment={ct.parentComment}
              collapseMiddle={true}
              trackingLocation={'feed'}
            />
          </Col>
        </Row>
      ))}
    </Col>
  )
}
