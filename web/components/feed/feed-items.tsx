import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import {
  useFeedBets,
  useFeedComments,
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

export const FeedItems = (props: {
  contracts: Contract[]
  boosts?: BoostsType
  user: User | null | undefined
}) => {
  const { user, boosts } = props

  const organicContracts = props.contracts.map((c) => ({
    ...c,
    type: 'contract' as const,
  }))

  const boostedContracts =
    boosts?.map((boost) => {
      const { market_data, ...rest } = boost
      return { ...market_data, ...rest, type: 'boost' as const }
    }) ?? []

  const contracts = mergePeriodic(organicContracts, boostedContracts, AD_PERIOD)

  const contractIds = contracts.map((c) => c.id)
  const maxBets = 2
  const maxComments = 1
  const { parentCommentsByContractId, childCommentsByParentCommentId } =
    useFeedComments(user, contractIds)
  const recentBets = useFeedBets(user, contractIds)
  const groupedItems = contracts.map((contract) => {
    const parentComments = parentCommentsByContractId[contract.id] ?? []
    const relatedBets = recentBets.filter(
      (bet) => bet.contractId === contract.id
    )
    return {
      contract,
      parentComments: parentComments.slice(0, maxComments),
      relatedBets: relatedBets.slice(0, maxBets),
    }
  })

  return (
    <Col>
      {groupedItems.map((itemGroup) => {
        const { contract, parentComments, relatedBets } = itemGroup
        const hasItems = parentComments.length > 0 || recentBets.length > 0

        const promotedData =
          contract.type === 'boost'
            ? {
                adId: contract.ad_id,
                reward: AD_REDEEM_REWARD,
              }
            : undefined

        return (
          <Col
            key={contract.id + 'feed'}
            className={
              'border-ink-200 hover:border-ink-400 my-2 overflow-y-hidden rounded-xl border'
            }
          >
            <FeedContractCard
              contract={contract}
              className={clsx(
                'my-0 border-0',
                hasItems ? 'rounded-t-xl rounded-b-none' : ''
              )}
              promotedData={promotedData}
              trackingPostfix="feed"
              hasItems={hasItems}
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
          </Col>
        )
      })}
    </Col>
  )
}

// every period items in A, insert an item from B
export function mergePeriodic<A, B>(a: A[], b: B[], period: number): (A | B)[] {
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
