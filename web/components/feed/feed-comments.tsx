import { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { memo, ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import {
  EyeOffIcon,
  FlagIcon,
  LinkIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/outline'
import {
  DotsHorizontalIcon,
  ReplyIcon,
  XCircleIcon,
} from '@heroicons/react/solid'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { CommentView } from 'common/events'
import { buildArray } from 'common/util/array'
import { formatMoney } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import { toast } from 'react-hot-toast'
import { ReportModal } from 'web/components/buttons/report-button'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { EditCommentModal } from 'web/components/comments/edit-comment-modal'
import { LikeButton } from 'web/components/contract/like-button'
import {
  CopyLinkDateTimeComponent,
  copyLinkToComment,
  getCommentLink,
} from 'web/components/feed/copy-link-date-time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { OutcomeLabel } from 'web/components/outcome-label'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { useAdminOrTrusted } from 'web/hooks/use-admin'
import { useEvent } from 'web/hooks/use-event'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/firebase/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import TriangleFillIcon from 'web/lib/icons/triangle-fill-icon.svg'
import { track } from 'web/lib/service/analytics'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { Button, IconButton } from '../buttons/button'
import { CommentEditHistoryButton } from '../comments/comment-edit-history-button'
import { CommentInput, CommentType } from '../comments/comment-input'
import { ReplyToggle } from '../comments/reply-toggle'
import { AwardBountyButton } from '../contract/bountied-question'
import { Content } from '../widgets/editor'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { isAdminId } from 'common/envs/constants'
import { PaymentsModal } from 'web/pages/payments'
import TipJar from 'web/public/custom-components/tipJar'
import { Answer, DpmAnswer } from 'common/answer'
import { CommentOnAnswerRow } from './feed-answer-comment-group'
import { usePartialUpdater } from 'web/hooks/use-partial-updater'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { FeedReplyBet } from 'web/components/feed/feed-bets'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { HOUR_MS } from 'common/util/time'
import { FaArrowTrendUp, FaArrowTrendDown } from 'react-icons/fa6'
import { last, orderBy } from 'lodash'
import { AnnotateChartModal } from 'web/components/annotate-chart'
import { BiRepost } from 'react-icons/bi'

export type ReplyToUserInfo = { id: string; username: string }

const roundThreadColor = 'border-ink-100 dark:border-ink-300'
const straightThreadColor = 'bg-ink-100 dark:bg-ink-300'

export function FeedCommentThread(props: {
  contract: Contract
  threadComments: ContractComment[]
  parentComment: ContractComment
  trackingLocation: string
  collapseMiddle?: boolean
  inTimeline?: boolean
  idInUrl?: string
  showReplies?: boolean
  childrenBountyTotal?: number
  className?: string
  onSubmitReply?: () => void
  bets?: Bet[]
}) {
  const {
    contract,
    threadComments,
    parentComment,
    collapseMiddle,
    trackingLocation,
    inTimeline,
    idInUrl,
    showReplies,
    childrenBountyTotal,
    className,
    onSubmitReply,
    bets,
  } = props
  const [replyToUserInfo, setReplyToUserInfo] = useState<ReplyToUserInfo>()

  const idInThisThread =
    idInUrl && threadComments.map((comment) => comment.id).includes(idInUrl)

  const [seeReplies, setSeeReplies] = useState(
    !parentComment.hidden && (showReplies || !!idInThisThread)
  )

  const onSeeRepliesClick = useEvent(() => setSeeReplies(!seeReplies))
  const clearReply = useEvent(() => setReplyToUserInfo(undefined))
  const onReplyClick = useEvent((comment: ContractComment) => {
    setSeeReplies(true)
    setReplyToUserInfo({ id: comment.id, username: comment.userUsername })
  })
  const [collapseToIndex, setCollapseToIndex] = useState<number>(
    collapseMiddle && threadComments.length > 2
      ? threadComments.length - 2
      : Infinity
  )
  return (
    <Col className={clsx('mt-3 items-stretch gap-3', className)}>
      <ParentFeedComment
        key={parentComment.id}
        contract={contract}
        comment={parentComment}
        highlighted={idInUrl === parentComment.id}
        seeReplies={seeReplies}
        numReplies={threadComments.length}
        onSeeReplyClick={onSeeRepliesClick}
        onReplyClick={onReplyClick}
        trackingLocation={trackingLocation}
        inTimeline={inTimeline}
        childrenBountyTotal={childrenBountyTotal}
        bets={bets?.filter((bet) => bet.replyToCommentId === parentComment.id)}
      />
      {seeReplies &&
        threadComments
          .slice(0, collapseToIndex)
          .map((comment, i) => (
            <FeedComment
              key={comment.id}
              contract={contract}
              comment={comment}
              highlighted={idInUrl === comment.id}
              onReplyClick={onReplyClick}
              trackingLocation={trackingLocation}
              bets={bets?.filter((bet) => bet.replyToCommentId === comment.id)}
              lastInReplyChain={i === threadComments.length - 1}
            />
          ))}
      {seeReplies && threadComments.length > collapseToIndex && (
        <Row
          className={'justify-end sm:-mb-2 sm:mt-1'}
          key={parentComment.id + 'see-replies-feed-button'}
        >
          <Button
            size={'xs'}
            color={'gray-white'}
            onClick={() => {
              setCollapseToIndex(Infinity)
            }}
          >
            <Col>
              <TriangleFillIcon className={'mr-2 h-2'} />
              <TriangleDownFillIcon className={'mr-2 h-2'} />
            </Col>
            See {threadComments.length - 1} replies
          </Button>
        </Row>
      )}

      <div
        className={clsx('stop-prop flex', replyToUserInfo ? 'block' : 'hidden')}
      >
        <div
          className={clsx(
            roundThreadColor,
            '-mt-3 ml-4 h-7 w-4 rounded-bl-xl border-b-2 border-l-2'
          )}
        />
        <ContractCommentInput
          contract={contract}
          parentCommentId={parentComment.id}
          replyToUserInfo={replyToUserInfo}
          clearReply={clearReply}
          trackingLocation={trackingLocation}
          className="w-full min-w-0 grow"
          onSubmit={onSubmitReply}
          commentTypes={['comment']}
        />
      </div>
    </Col>
  )
}

export const FeedComment = memo(function FeedComment(props: {
  contract: Contract
  comment: ContractComment
  trackingLocation: string
  highlighted?: boolean
  onReplyClick?: (comment: ContractComment) => void
  children?: ReactNode
  inTimeline?: boolean
  isParent?: boolean
  bets?: Bet[]
  lastInReplyChain?: boolean
}) {
  const {
    contract,
    highlighted,
    onReplyClick,
    children,
    trackingLocation,
    inTimeline,
    isParent,
    bets,
    lastInReplyChain,
  } = props

  const groupedBets = useMemo(() => {
    // Sort the bets by createdTime
    const sortedBets = orderBy(bets, 'createdTime', 'asc')

    const tempGrouped: Bet[][] = []
    sortedBets.forEach((currentBet) => {
      // Check if the bet was made within the last 2 hours
      const isRecentBet = Date.now() - currentBet.createdTime < 2 * HOUR_MS

      if (isRecentBet) {
        // If the bet was made within the last 2 hours, add it as an individual group
        tempGrouped.push([currentBet])
        return
      }
      let foundGroup = false
      for (const group of tempGrouped) {
        const lastBetInGroup = last(group)
        if (!lastBetInGroup) break
        const outcomesMatch = currentBet.outcome === lastBetInGroup.outcome
        const sameSign =
          Math.sign(currentBet.amount) === Math.sign(lastBetInGroup.amount)

        if (outcomesMatch && sameSign) {
          group.push(currentBet)
          foundGroup = true
          break
        }
      }
      if (!foundGroup) tempGrouped.push([currentBet])
    })

    return tempGrouped
  }, [bets?.length])

  // for optimistic updates
  const [comment, updateComment] = usePartialUpdater(props.comment)
  useEffect(() => updateComment(props.comment), [props.comment])

  const { userUsername, userAvatarUrl } = comment
  const ref = useRef<HTMLDivElement>(null)
  const marketCreator = contract.creatorId === comment.userId
  const isBetParent = !!bets?.length

  useEffect(() => {
    if (highlighted && ref.current) {
      scrollIntoViewCentered(ref.current)
    }
  }, [highlighted])

  return (
    <Col className="group">
      <CommentReplyHeader comment={comment} contract={contract} />
      <Row ref={ref} className={clsx(isParent ? 'gap-2' : 'gap-1')}>
        <Row className="relative">
          {/*// Curved reply line*/}
          {!isParent && (
            <div
              className={clsx(
                roundThreadColor,
                '-mt-4 ml-4 h-6 w-4 rounded-bl-xl border-b-2 border-l-2'
              )}
            />
          )}
          <Avatar
            username={userUsername}
            size={isParent ? 'sm' : '2xs'}
            avatarUrl={userAvatarUrl}
            className={clsx(marketCreator && 'shadow shadow-amber-300', 'z-10')}
          />
          {/* Outer vertical reply line*/}
          <div
            className={clsx(
              straightThreadColor,
              'absolute bottom-0 left-4 w-0.5',
              isParent ? 'top-0' : '-top-1',
              (!isBetParent || lastInReplyChain) && 'group-last:hidden'
            )}
          />
          {/* Inner vertical reply line*/}
          {isBetParent && !isParent && (
            <div
              className={clsx(
                straightThreadColor,
                'absolute bottom-0 left-10 top-0 w-0.5'
              )}
            />
          )}
        </Row>

        <Col
          className={clsx(
            'grow rounded-lg rounded-tl-none px-3 pb-0.5 pt-1 transition-colors',
            highlighted
              ? 'bg-primary-100 border-primary-300 border-2'
              : 'bg-canvas-50'
          )}
        >
          <FeedCommentHeader
            comment={comment}
            updateComment={updateComment}
            contract={contract}
            inTimeline={inTimeline}
            isParent={isParent}
          />

          <HideableContent comment={comment} />
          <Row>
            {children}
            <CommentActions
              onReplyClick={onReplyClick}
              onAward={(total) => updateComment({ bountyAwarded: total })}
              comment={comment}
              contract={contract}
              trackingLocation={trackingLocation}
            />
          </Row>
        </Col>
      </Row>
      {!!bets?.length && (
        <Row>
          <Col className={'w-full'}>
            {groupedBets?.map((bets, i) => {
              return (
                <Row
                  className={'relative mt-1 w-full'}
                  key={bets.map((b) => b.id) + '-reply'}
                >
                  {/* Curved bet reply line*/}
                  <div
                    className={clsx(
                      roundThreadColor,
                      'rounded-bl-xl border-b-2 border-l-2 ',
                      isParent ? '-mt-2 ml-4 h-4 w-4' : '-mt-7 ml-10 h-10 w-4'
                    )}
                  />
                  {/* Outer vertical bet reply line*/}
                  <div
                    className={clsx(
                      straightThreadColor,
                      'absolute bottom-0 left-4 w-0.5 group-last:hidden ',
                      isParent ? 'top-0' : '-top-1'
                    )}
                  />
                  <FeedReplyBet
                    className={'bg-canvas-50'}
                    avatarSize={'2xs'}
                    contract={contract}
                    bets={bets}
                  />
                  {/* Inner vertical bet reply line*/}
                  <div
                    className={clsx(
                      straightThreadColor,
                      'absolute w-0.5 ',
                      isParent ? '  left-4 top-0' : '-top-1 left-10',
                      i === groupedBets.length - 1 ? 'hidden' : 'bottom-0'
                    )}
                  />
                </Row>
              )
            })}
          </Col>
        </Row>
      )}
    </Col>
  )
})

const ParentFeedComment = memo(function ParentFeedComment(props: {
  contract: Contract
  comment: ContractComment
  highlighted?: boolean
  seeReplies: boolean
  numReplies: number
  onReplyClick?: (comment: ContractComment) => void
  onSeeReplyClick: () => void
  trackingLocation: string
  inTimeline?: boolean
  childrenBountyTotal?: number
  bets?: Bet[]
}) {
  const {
    contract,
    comment,
    highlighted,
    onReplyClick,
    onSeeReplyClick,
    seeReplies,
    numReplies,
    trackingLocation,
    inTimeline,
    childrenBountyTotal,
    bets,
  } = props
  const { ref } = useIsVisible(
    () =>
      track('view comment thread', {
        contractId: contract.id,
        commentId: comment.id,
      } as CommentView),
    false
  )

  return (
    <FeedComment
      contract={contract}
      comment={comment}
      onReplyClick={onReplyClick}
      highlighted={highlighted}
      trackingLocation={trackingLocation}
      inTimeline={inTimeline}
      isParent={true}
      bets={bets}
    >
      <div ref={ref} />
      <ReplyToggle
        seeReplies={seeReplies}
        numComments={numReplies}
        childrenBountyTotal={childrenBountyTotal}
        onSeeReplyClick={onSeeReplyClick}
      />
    </FeedComment>
  )
})

function HideableContent(props: { comment: ContractComment }) {
  const { comment } = props
  const { text, content } = comment
  const [showHidden, setShowHidden] = useState(false)
  return comment.hidden && !showHidden ? (
    <div
      className="hover text-ink-600 text-sm font-thin italic hover:cursor-pointer"
      onClick={() => {
        setShowHidden(!showHidden)
      }}
    >
      Comment hidden
    </div>
  ) : (
    <Content size="sm" className="mt-1 grow" content={content || text} />
  )
}

export function DotMenu(props: {
  comment: ContractComment
  updateComment: (update: Partial<ContractComment>) => void
  contract: Contract
}) {
  const { comment, updateComment, contract } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const user = useUser()
  const privateUser = usePrivateUser()
  const isMod = useAdminOrTrusted()
  const isContractCreator = privateUser?.id === contract.creatorId
  const [editingComment, setEditingComment] = useState(false)
  const [tipping, setTipping] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  return (
    <>
      <ReportModal
        report={{
          contentOwnerId: comment.userId,
          contentId: comment.id,
          contentType: 'comment',
          parentId: contract.id,
          parentType: 'contract',
        }}
        setIsModalOpen={setIsModalOpen}
        isModalOpen={isModalOpen}
        label={'Comment'}
      />
      <DropdownMenu
        menuWidth={'w-36'}
        icon={
          <DotsHorizontalIcon
            className="mt-[0.12rem] h-4 w-4"
            aria-hidden="true"
          />
        }
        items={buildArray(
          {
            name: 'Copy link',
            icon: <LinkIcon className="h-5 w-5" />,
            onClick: () => {
              copyLinkToComment(
                contract.creatorUsername,
                contract.slug,
                comment.id
              )
            },
          },
          user &&
            comment.userId !== user.id && {
              name: 'Tip',
              icon: <TipJar size={20} color="currentcolor" />,
              onClick: () => setTipping(true),
            },
          user &&
            comment.userId !== user.id && {
              name: 'Report',
              icon: <FlagIcon className="h-5 w-5" />,
              onClick: () => {
                if (user?.id !== comment.userId) setIsModalOpen(true)
                else toast.error(`You can't report your own comment`)
              },
            },
          user &&
            (comment.userId === user.id || isAdminId(user?.id)) && {
              name: 'Edit',
              icon: <PencilIcon className="h-5 w-5" />,
              onClick: () => setEditingComment(true),
            },
          isContractCreator && {
            name: 'Add to chart',
            icon: <PlusCircleIcon className="h-5 w-5 text-green-500" />,
            onClick: async () => setAnnotating(true),
          },
          (isMod || isContractCreator) && {
            name: comment.hidden ? 'Unhide' : 'Hide',
            icon: <EyeOffIcon className="h-5 w-5 text-red-500" />,
            onClick: async () => {
              const commentPath = `contracts/${contract.id}/comments/${comment.id}`
              const wasHidden = comment.hidden
              updateComment({ hidden: !wasHidden })

              try {
                await api('hide-comment', { commentPath })
              } catch (e) {
                toast.error(
                  wasHidden ? 'Error unhiding comment' : 'Error hiding comment'
                )
                // undo optimistic update
                updateComment({ hidden: wasHidden })
              }
            },
          }
        )}
      />
      {annotating && (
        <AnnotateChartModal
          open={annotating}
          setOpen={setAnnotating}
          contractId={contract.id}
          atTime={comment.createdTime}
          comment={comment}
        />
      )}
      {user && editingComment && (
        <EditCommentModal
          user={user}
          comment={comment}
          setContent={(content) => updateComment({ content })}
          contract={contract}
          open={editingComment}
          setOpen={setEditingComment}
        />
      )}
      {user && tipping && (
        <PaymentsModal
          fromUser={user}
          toUser={{
            id: comment.userId,
            name: comment.userName,
            username: comment.userUsername,
            avatarUrl: comment.userAvatarUrl ?? '',
          }}
          setShow={setTipping}
          show={tipping}
          groupId={comment.id}
          defaultMessage={`Tip for comment on ${
            contract.question
          } ${getCommentLink(
            contract.creatorUsername,
            contract.slug,
            comment.id
          )}`}
        />
      )}
    </>
  )
}

function CommentActions(props: {
  onReplyClick?: (comment: ContractComment) => void
  onAward?: (bountyTotal: number) => void
  comment: ContractComment
  contract: Contract
  trackingLocation: string
}) {
  const { onReplyClick, onAward, comment, contract, trackingLocation } = props
  const user = useUser()
  const privateUser = usePrivateUser()

  const isBountiedQuestion = contract.outcomeType === 'BOUNTIED_QUESTION'
  const canGiveBounty =
    isBountiedQuestion &&
    user &&
    user.id == contract.creatorId &&
    comment.userId != user.id &&
    onAward
  const [showBetModal, setShowBetModal] = useState(false)
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES')
  const diff =
    (comment.betReplyAmountsByOutcome?.YES ?? 0) -
    (comment.betReplyAmountsByOutcome?.NO ?? 0)
  return (
    <Row className="grow items-center justify-end">
      {canGiveBounty && (
        <AwardBountyButton
          contract={contract}
          comment={comment}
          onAward={onAward}
          user={user}
          disabled={contract.bountyLeft <= 0}
          buttonClassName={'mr-1'}
        />
      )}
      {user && contract.outcomeType === 'BINARY' && (
        <IconButton
          onClick={() => {
            track('bet intent', { location: 'comment on contract' })
            setOutcome('YES')
            setShowBetModal(true)
          }}
          size={'xs'}
        >
          <Tooltip text="Reply with a bet" placement="bottom">
            <Row className={'mt-0.5 gap-1'}>
              {diff != 0 && (
                <span className="">{Math.round(Math.abs(diff))}</span>
              )}
              {diff > 0 ? (
                <FaArrowTrendUp className={'h-5 w-5 text-teal-500'} />
              ) : diff < 0 ? (
                <FaArrowTrendDown className={'text-scarlet-500 h-5 w-5'} />
              ) : (
                <FaArrowTrendUp className={'h-5 w-5'} />
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
          className={'text-ink-500'}
        >
          <Tooltip text="Reply with a comment" placement="bottom">
            <ReplyIcon className="h-5 w-5 " />
          </Tooltip>
        </IconButton>
      )}
      <LikeButton
        contentCreatorId={comment.userId}
        contentId={comment.id}
        user={user}
        contentType={'comment'}
        size={'xs'}
        contentText={richTextToString(comment.content)}
        disabled={isBlocked(privateUser, comment.userId)}
        trackingLocation={trackingLocation}
      />
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
              contract={contract as any}
              user={user}
              initialOutcome={outcome}
              onBuySuccess={() => setTimeout(() => setShowBetModal(false), 500)}
              location={'comment on contract'}
              inModal={true}
              replyToCommentId={comment.id}
            />
          </Col>
        </Modal>
      )}
    </Row>
  )
}

function CommentStatus(props: {
  contract: Contract
  comment: ContractComment
}) {
  const { contract, comment } = props
  const { resolution } = contract
  const {
    commenterPositionProb,
    commenterPositionOutcome,
    commenterPositionAnswerId,
    commenterPositionShares,
  } = comment

  if (
    comment.betId == null &&
    commenterPositionProb != null &&
    commenterPositionOutcome != null &&
    commenterPositionShares != null &&
    commenterPositionShares > 0 &&
    contract.outcomeType !== 'NUMERIC'
  )
    return (
      <>
        {resolution ? 'predicted ' : `predicts `}
        <OutcomeLabel
          outcome={commenterPositionOutcome}
          answerId={commenterPositionAnswerId}
          contract={contract}
          truncate="short"
        />
      </>
    )

  return <span />
}

export function ContractCommentInput(props: {
  contract: Contract
  className?: string
  replyTo?: Answer | DpmAnswer | Bet
  replyToUserInfo?: ReplyToUserInfo
  parentCommentId?: string
  clearReply?: () => void
  trackingLocation: string
  onSubmit?: (comment: ContractComment) => void
  commentTypes: CommentType[]
  onClearInput?: () => void
}) {
  const user = useUser()
  const privateUser = usePrivateUser()
  const {
    contract,
    replyTo,
    parentCommentId,
    replyToUserInfo,
    className,
    clearReply,
    trackingLocation,
    onSubmit,
    commentTypes,
    onClearInput,
  } = props
  const isReplyToBet = replyTo && 'amount' in replyTo
  const isReplyToAnswer = replyTo && !isReplyToBet

  const onSubmitComment = useEvent(
    async (editor: Editor, type: CommentType) => {
      if (!user) {
        track('sign in to comment')
        await firebaseLogin()
        return
      }

      let comment: ContractComment | undefined
      if (type === 'comment') {
        comment = await api('comment', {
          contractId: contract.id,
          content: editor.getJSON(),
          replyToAnswerId: isReplyToAnswer ? replyTo.id : undefined,
          replyToCommentId: parentCommentId,
          replyToBetId: isReplyToBet ? replyTo.id : undefined,
        })
      } else {
        comment = await toast.promise(
          api('post', {
            contractId: contract.id,
            content: editor.getJSON(),
          }),
          {
            loading: 'Reposting question & comment to your followers...',
            success: 'Question & comment posted to your followers!',
            error: 'Error posting',
          }
        )
      }
      clearReply?.()
      onSubmit?.(comment)
      await track(type, {
        location: trackingLocation,
        replyTo: isReplyToBet
          ? 'bet'
          : isReplyToAnswer
          ? 'answer'
          : replyToUserInfo
          ? 'user'
          : undefined,
      })
    }
  )

  return (
    <>
      {isReplyToBet ? (
        <CommentOnBetRow
          betAmount={replyTo.amount}
          betOutcome={replyTo.outcome}
          bettorName={replyTo.userName}
          bettorUsername={replyTo.userUsername}
          contract={contract}
          clearReply={clearReply}
          className={'ml-10 mt-6 w-full'}
        />
      ) : replyTo ? (
        <CommentOnAnswerRow
          answer={replyTo}
          contract={contract as any}
          clear={clearReply}
        />
      ) : null}

      <CommentInput
        replyToUserInfo={replyToUserInfo}
        parentCommentId={parentCommentId}
        onSubmitComment={onSubmitComment}
        pageId={contract.id}
        className={className}
        blocked={isBlocked(privateUser, contract.creatorId)}
        placeholder={
          replyTo || parentCommentId
            ? 'Write a reply ...'
            : contract.outcomeType === 'BOUNTIED_QUESTION'
            ? 'Write an answer or comment'
            : undefined
        }
        commentTypes={commentTypes}
        onClearInput={onClearInput}
      />
    </>
  )
}

export function FeedCommentHeader(props: {
  comment: ContractComment
  contract: Contract
  updateComment?: (comment: Partial<ContractComment>) => void
  inTimeline?: boolean
  isParent?: boolean
}) {
  const { comment, updateComment, contract, inTimeline } = props
  const {
    userUsername,
    userName,
    createdTime,
    editedTime,
    bettorUsername,
    betOutcome,
    betAnswerId,
    answerOutcome,
    betAmount,
    userId,
    isApi,
    bountyAwarded,
    isRepost,
  } = comment

  const marketCreator = contract.creatorId === userId
  const { bought, money } = getBoughtMoney(betAmount)
  const shouldDisplayOutcome = betOutcome && !answerOutcome
  return (
    <Col className={clsx('text-ink-600 text-sm ')}>
      <Row className="justify-between">
        <Row className=" gap-1">
          <span>
            <UserLink
              user={{
                id: userId,
                name: userName,
                username: userUsername,
              }}
              marketCreator={marketCreator}
              className={'font-semibold'}
            />
            {isRepost && (
              <span className="text-ink-500 ml-1">
                <BiRepost className="mr-1 inline h-4 w-4" />
                reposted
              </span>
            )}
            {/* Hide my status if replying to a bet, it's too much clutter*/}
            {bettorUsername == undefined && !inTimeline && (
              <span className="text-ink-500 ml-1">
                <CommentStatus contract={contract} comment={comment} />
                {bought} {money}
                {shouldDisplayOutcome && (
                  <>
                    {' '}
                    of{' '}
                    <OutcomeLabel
                      outcome={betOutcome ? betOutcome : ''}
                      answerId={betAnswerId}
                      contract={contract}
                      truncate="short"
                    />
                  </>
                )}
              </span>
            )}
            {editedTime ? (
              <CommentEditHistoryButton comment={comment} />
            ) : (
              <CopyLinkDateTimeComponent
                prefix={contract.creatorUsername}
                slug={contract.slug}
                createdTime={editedTime ? editedTime : createdTime}
                elementId={comment.id}
                size={'sm'}
                linkClassName="text-ink-500"
              />
            )}
            {!inTimeline && isApi && (
              <InfoTooltip text="Placed via API" className="mx-1">
                🤖
              </InfoTooltip>
            )}
          </span>
          {!inTimeline && updateComment && (
            <DotMenu
              updateComment={updateComment}
              comment={comment}
              contract={contract}
            />
          )}
        </Row>
        {bountyAwarded && bountyAwarded > 0 && (
          <span className="select-none text-teal-600">
            +{formatMoney(bountyAwarded)}
          </span>
        )}
      </Row>
    </Col>
  )
}

const getBoughtMoney = (betAmount: number | undefined) => {
  let bought: string | undefined
  let money: string | undefined
  if (betAmount != undefined) {
    bought = betAmount >= 0 ? 'bought' : 'sold'
    money = formatMoney(Math.abs(betAmount))
  }
  return { bought, money }
}

export function CommentReplyHeader(props: {
  comment: ContractComment
  contract: Contract
}) {
  const { comment, contract } = props
  const {
    bettorName,
    bettorUsername,
    betOutcome,
    betAnswerId,
    betAmount,
    answerOutcome,
  } = comment
  if (bettorUsername && bettorName && betOutcome && betAmount) {
    return (
      <CommentOnBetRow
        betOutcome={betOutcome}
        betAnswerId={betAnswerId}
        betAmount={betAmount}
        bettorName={bettorName}
        bettorUsername={bettorUsername}
        contract={contract}
      />
    )
  }
  if (answerOutcome && 'answers' in contract) {
    const answer = (contract.answers as (DpmAnswer | Answer)[]).find(
      (a) => a.id === answerOutcome
    )
    if (answer)
      return <CommentOnAnswerRow answer={answer} contract={contract as any} />
  }

  return null
}

export function CommentOnBetRow(props: {
  contract: Contract
  betOutcome: string
  betAmount: number
  bettorName: string
  bettorUsername: string
  betAnswerId?: string
  clearReply?: () => void
  className?: string
}) {
  const {
    betOutcome,
    betAmount,
    bettorName,
    bettorUsername,
    betAnswerId,
    contract,
    clearReply,
  } = props
  const { bought, money } = getBoughtMoney(betAmount)

  return (
    <Row className="ml-4 items-end text-sm">
      <div
        className={clsx(
          roundThreadColor,
          'h-4 w-6 rounded-tl-xl border-2 border-b-0 border-r-0'
        )}
      />
      <Row className="bg-ink-100 text-ink-600 relative items-center gap-1 whitespace-nowrap px-4 py-1">
        <UserLink
          user={{ id: '', name: bettorName, username: bettorUsername }}
        />
        {bought} <span className="text-ink-1000">{money}</span> of
        <OutcomeLabel
          outcome={betOutcome ? betOutcome : ''}
          answerId={betAnswerId}
          contract={contract}
          truncate="short"
        />
        {clearReply && (
          <button
            onClick={clearReply}
            className={
              'bg-canvas-0 text-ink-500 hover:text-ink-600 absolute -right-2 -top-1.5 rounded-full'
            }
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        )}
      </Row>
    </Row>
  )
}
