import { ReplyIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { richTextToString } from 'common/util/parse'
import { useState } from 'react'
import { FaArrowTrendDown, FaArrowTrendUp } from 'react-icons/fa6'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { BuyPanel } from '../bet/bet-panel'
import { IconButton } from '../buttons/button'
import { AwardBountyButton } from '../contract/bountied-question'
import { ReactButton } from '../contract/react-button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'
import { PrivateUser, User } from 'common/user'

export function CommentActions(props: {
  onReplyClick?: (comment: ContractComment) => void
  onAward?: (bountyTotal: number) => void
  comment: ContractComment
  liveContract: Contract // NOT the main contract that has the comments. this is for bets/bounty
  trackingLocation: string
}) {
  const { onReplyClick, onAward, comment, liveContract, trackingLocation } =
    props
  const user = useUser()
  const privateUser = usePrivateUser()

  const isBountiedQuestion = liveContract.outcomeType === 'BOUNTIED_QUESTION'
  const canGiveBounty =
    isBountiedQuestion &&
    user &&
    user.id == liveContract.creatorId &&
    comment.userId != user.id &&
    onAward
  const [showBetModal, setShowBetModal] = useState(false)
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)
  const diff =
    (comment.betReplyAmountsByOutcome?.YES ?? 0) -
    (comment.betReplyAmountsByOutcome?.NO ?? 0)

  const isCashContract = liveContract.token === 'CASH'

  return (
    <Row className="grow items-center justify-end">
      <LikeAndDislikeComment
        comment={comment}
        trackingLocation={trackingLocation}
        privateUser={privateUser}
        user={user}
      />
      {canGiveBounty && (
        <AwardBountyButton
          contract={liveContract}
          comment={comment}
          onAward={onAward}
          user={user}
          disabled={liveContract.bountyLeft <= 0}
          buttonClassName={'mr-1 min-w-[60px]'}
        />
      )}
      {user && liveContract.outcomeType === 'BINARY' && !isCashContract && (
        <IconButton
          onClick={() => {
            track('bet intent', {
              location: 'comment on contract',
              token: liveContract.token,
            })
            setOutcome('YES')
            setShowBetModal(true)
          }}
          size={'xs'}
          className={'min-w-[60px]'}
        >
          <Tooltip text={`Reply with a ${TRADE_TERM}`} placement="bottom">
            <Row className="gap-1">
              {diff > 0 ? (
                <FaArrowTrendUp className={'h-5 w-5 text-teal-500'} />
              ) : diff < 0 ? (
                <FaArrowTrendDown className={'text-scarlet-500 h-5 w-5'} />
              ) : (
                <FaArrowTrendUp className={'h-5 w-5'} />
              )}
              {diff != 0 && (
                <span className="">{Math.round(Math.abs(diff))}</span>
              )}
            </Row>
          </Tooltip>
        </IconButton>
      )}
      {user && onReplyClick && (
        <IconButton
          size={'xs'}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReplyClick(comment)
          }}
          className={'text-ink-500 min-w-[60px]'}
        >
          <Tooltip text="Reply with a comment" placement="bottom">
            <ReplyIcon className="h-5 w-5 " />
          </Tooltip>
        </IconButton>
      )}

      {showBetModal && (
        <Modal
          open={showBetModal}
          setOpen={setShowBetModal}
          className={clsx(
            MODAL_CLASS,
            'pointer-events-auto max-h-[32rem] overflow-auto'
          )}
        >
          <Col>
            <span className={'text-primary-700 mb-4 line-clamp-2 text-lg'}>
              @{comment.userUsername}: {richTextToString(comment.content)}
            </span>
            <BuyPanel
              contract={liveContract as any}
              initialOutcome={outcome}
              onBuySuccess={() => setTimeout(() => setShowBetModal(false), 500)}
              location={'comment on contract'}
              inModal={true}
              replyToCommentId={comment.id}
              alwaysShowOutcomeSwitcher={true}
            />
          </Col>
        </Modal>
      )}
    </Row>
  )
}

export function LikeAndDislikeComment(props: {
  comment: ContractComment
  trackingLocation: string
  privateUser: PrivateUser | null | undefined
  user: User | null | undefined
}) {
  const { comment, trackingLocation, privateUser, user } = props
  const [userReactedWith, setUserReactedWith] = useState<
    'like' | 'dislike' | 'none'
  >('none')
  return (
    <>
      <ReactButton
        contentCreatorId={comment.userId}
        contentId={comment.id}
        user={user}
        contentType={'comment'}
        size={'xs'}
        contentText={richTextToString(comment.content)}
        disabled={isBlocked(privateUser, comment.userId)}
        trackingLocation={trackingLocation}
        iconType={'thumb'}
        reactionType={'like'}
        userReactedWith={userReactedWith}
        onReact={() => setUserReactedWith('like')}
        onUnreact={() => setUserReactedWith('none')}
        className={'min-w-[60px]'}
      />
      <ReactButton
        contentCreatorId={comment.userId}
        contentId={comment.id}
        user={user}
        contentType={'comment'}
        size={'xs'}
        contentText={richTextToString(comment.content)}
        disabled={isBlocked(privateUser, comment.userId)}
        trackingLocation={trackingLocation}
        iconType={'thumb'}
        reactionType={'dislike'}
        userReactedWith={userReactedWith}
        onReact={() => setUserReactedWith('dislike')}
        onUnreact={() => setUserReactedWith('none')}
        className={'min-w-[60px]'}
        hideReactList
      />
    </>
  )
}
