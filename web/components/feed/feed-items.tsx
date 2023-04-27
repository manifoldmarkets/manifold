import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { ContractCardNew } from 'web/components/contract/contract-card'
import {
  useFeedBets,
  useFeedComments,
} from 'web/hooks/use-additional-feed-items'
import { User } from 'common/user'
import { FeedCommentThread } from 'web/components/feed/feed-comments'
import { SummarizeBets, groupBetsByCreatedTimeAndUserId } from './feed-bets'
import { Bet } from 'common/bet'
import { sumBy } from 'lodash'
import clsx from 'clsx'
import { Row } from '../layout/row'
import { ContractComment } from 'common/comment'

export const FeedItems = (props: {
  contracts: Contract[]
  user: User | null | undefined
}) => {
  const { contracts, user } = props
  const contractIds = contracts.map((c) => c.id)
  const maxItems = 2
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
      parentComments: parentComments.slice(0, maxItems),
      relatedBets: relatedBets.slice(0, maxItems),
    }
  })

  return (
    <Col>
      {groupedItems.map((itemGroup) => {
        const { contract, parentComments, relatedBets } = itemGroup
        const hasItems = parentComments.length > 0 || recentBets.length > 0

        return (
          <Col
            key={contract.id + 'feed'}
            className={
              'border-ink-200 my-1 overflow-y-hidden rounded-xl border'
            }
          >
            <ContractCardNew
              contract={contract}
              className={clsx(
                'my-0 border-0',
                hasItems ? 'rounded-t-xl rounded-b-none  ' : ''
              )}
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
  const { contract } = props
  const ignoredCommentTypes = ['gridCardsComponent']
  const commentThreads = props.commentThreads.filter(
    (ct) =>
      !ct.parentComment.content?.content?.some((c) =>
        ignoredCommentTypes.includes(c.type ?? '')
      ) &&
      !ct.childComments.some((c) =>
        c.content?.content?.some((c) =>
          ignoredCommentTypes.includes(c.type ?? '')
        )
      )
  )
  return (
    <Col className={'w-full'}>
      {commentThreads.map((ct, index) => (
        <Row
          className={'relative w-full'}
          key={ct.parentComment.id + 'feed-thread'}
        >
          {index !== commentThreads.length - 1 ? (
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
            />
          </Col>
        </Row>
      ))}
    </Col>
  )
}
