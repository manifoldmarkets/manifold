import { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { memo, ReactNode, useEffect, useRef, useState } from 'react'

import { EyeOffIcon, FlagIcon, PencilIcon } from '@heroicons/react/outline'
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
import { useAdmin } from 'web/hooks/use-admin'
import { useEvent } from 'web/hooks/use-event'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { createCommentOnContract, hideComment } from 'web/lib/firebase/api'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import TriangleFillIcon from 'web/lib/icons/triangle-fill-icon.svg'
import { track } from 'web/lib/service/analytics'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { Button, IconButton } from '../buttons/button'
import { CommentEditHistoryButton } from '../comments/comment-edit-history-button'
import { CommentInput } from '../comments/comment-input'
import { ReplyToggle } from '../comments/reply-toggle'
import { AwardBountyButton } from '../contract/bountied-question'
import { Content } from '../widgets/editor'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { isAdminId } from 'common/envs/constants'
import { PaymentsModal } from 'web/pages/payments'
import { FiLink } from 'react-icons/fi'
import { GiPayMoney } from 'react-icons/gi'

export type ReplyToUserInfo = { id: string; username: string }

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
    <Col className="mt-3 w-full items-stretch gap-3">
      <ParentFeedComment
        key={parentComment.id}
        contract={contract}
        comment={parentComment}
        highlighted={idInUrl === parentComment.id}
        showLike={true}
        seeReplies={seeReplies}
        numReplies={threadComments.length}
        onSeeReplyClick={onSeeRepliesClick}
        onReplyClick={onReplyClick}
        trackingLocation={trackingLocation}
        inTimeline={inTimeline}
        childrenBountyTotal={childrenBountyTotal}
      />
      {seeReplies &&
        threadComments
          .slice(0, collapseToIndex)
          .map((comment) => (
            <FeedComment
              key={comment.id}
              contract={contract}
              comment={comment}
              highlighted={idInUrl === comment.id}
              showLike={true}
              onReplyClick={onReplyClick}
              trackingLocation={trackingLocation}
            />
          ))}
      {seeReplies && threadComments.length > collapseToIndex && (
        <Row
          className={'justify-end sm:mt-1 sm:-mb-2'}
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
      {replyToUserInfo && (
        <Col className="stop-prop relative ml-6">
          <ContractCommentInput
            contract={contract}
            parentCommentId={parentComment.id}
            replyToUserInfo={replyToUserInfo}
            clearReply={clearReply}
            trackingLocation={trackingLocation}
          />
        </Col>
      )}
    </Col>
  )
}
export const FeedComment = memo(function FeedComment(props: {
  contract: Contract
  comment: ContractComment
  trackingLocation: string
  highlighted?: boolean
  showLike?: boolean
  seeReplies?: boolean
  hasReplies?: boolean
  onReplyClick?: (comment: ContractComment) => void
  children?: ReactNode
  className?: string
  inTimeline?: boolean
  isParent?: boolean
}) {
  const {
    contract,
    className,
    comment,
    highlighted,
    showLike,
    seeReplies,
    hasReplies,
    onReplyClick,
    children,
    trackingLocation,
    inTimeline,
    isParent,
  } = props
  const { userUsername, userAvatarUrl } = comment
  const ref = useRef<HTMLDivElement>(null)
  const marketCreator = contract.creatorId === comment.userId

  useEffect(() => {
    if (highlighted && ref.current) {
      scrollIntoViewCentered(ref.current)
    }
  }, [highlighted])

  return (
    <Col className="group">
      {comment.bettorUsername !== undefined && (
        <FeedCommentReplyHeader comment={comment} contract={contract} />
      )}
      <Row ref={ref} className={clsx(className ? className : 'gap-2')}>
        <Col className="relative">
          <Row>
            {!isParent && (
              <div className="border-ink-200 -mt-4 ml-4 h-6 w-4 rounded-bl-xl border-b-2 border-l-2" />
            )}
            <Avatar
              username={userUsername}
              size={isParent ? 'sm' : '2xs'}
              avatarUrl={userAvatarUrl}
              className={clsx(
                marketCreator ? 'shadow shadow-amber-300' : '',
                'z-10'
              )}
            />
          </Row>
          {isParent && seeReplies && hasReplies && (
            <div className="bg-ink-200 absolute -top-0 left-4 bottom-0 w-0.5" />
          )}
          {!isParent && (
            <div className="bg-ink-200 absolute -top-1 left-4 bottom-0 w-0.5 group-last:hidden" />
          )}
        </Col>
        <Col
          className={clsx(
            'w-full rounded-xl rounded-tl-none px-4 py-1 transition-colors',
            highlighted
              ? 'bg-primary-100 border-primary-300 border-2'
              : 'bg-ink-100'
          )}
        >
          <FeedCommentHeader
            comment={comment}
            contract={contract}
            inTimeline={inTimeline}
            isParent={isParent}
          />

          <HideableContent comment={comment} />
          <Row className={children ? 'justify-between' : 'justify-end'}>
            {children}
            <CommentActions
              onReplyClick={onReplyClick}
              comment={comment}
              showLike={showLike}
              contract={contract}
              trackingLocation={trackingLocation}
            />
          </Row>
        </Col>
      </Row>
    </Col>
  )
})

export const ParentFeedComment = memo(function ParentFeedComment(props: {
  contract: Contract
  comment: ContractComment
  highlighted?: boolean
  showLike?: boolean
  seeReplies: boolean
  numReplies: number
  onReplyClick?: (comment: ContractComment) => void
  onSeeReplyClick: () => void
  trackingLocation: string
  inTimeline?: boolean
  childrenBountyTotal?: number
}) {
  const {
    contract,
    comment,
    highlighted,
    showLike,
    onReplyClick,
    onSeeReplyClick,
    seeReplies,
    numReplies,
    trackingLocation,
    inTimeline,
    childrenBountyTotal,
  } = props
  const { userUsername } = comment
  const { ref } = useIsVisible(
    () =>
      track('view comment thread', {
        contractId: contract.id,
        commentId: comment.id,
      } as CommentView),
    false
  )
  const commentKind = userUsername === 'ManifoldDream' ? 'ub-dream-comment' : ''
  return (
    <FeedComment
      contract={contract}
      comment={comment}
      seeReplies={seeReplies}
      hasReplies={numReplies > 0}
      onReplyClick={onReplyClick}
      highlighted={highlighted}
      showLike={showLike}
      className={clsx('gap-2', commentKind)}
      trackingLocation={trackingLocation}
      inTimeline={inTimeline}
      isParent={true}
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
  contract: Contract
}) {
  const { comment, contract } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const user = useUser()
  const privateUser = usePrivateUser()
  const isAdmin = useAdmin()
  const isContractCreator = privateUser?.id === contract.creatorId
  const [editingComment, setEditingComment] = useState(false)
  const [tipping, setTipping] = useState(false)
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
            icon: <FiLink className="h-5 w-5" />,
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
              icon: <GiPayMoney className="h-5 w-5" />,
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
          (isAdmin || isContractCreator) && {
            name: comment.hidden ? 'Unhide' : 'Hide',
            icon: <EyeOffIcon className="h-5 w-5 text-red-500" />,
            onClick: async () => {
              const commentPath = `contracts/${contract.id}/comments/${comment.id}`
              try {
                await hideComment({ commentPath })
              } catch (e: any) {
                toast.error(`Error hiding comment: ${e}`)
              }
            },
          }
        )}
      />
      {user && editingComment && (
        <EditCommentModal
          user={user}
          comment={comment}
          contract={contract}
          open={editingComment}
          setOpen={setEditingComment}
        />
      )}
      {user && tipping && (
        <PaymentsModal
          fromUser={user}
          toUser={
            {
              id: comment.userId,
              name: comment.userName,
              username: comment.userUsername,
              avatarUrl: comment.userAvatarUrl ?? '',
            } as User
          }
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
  comment: ContractComment
  contract: Contract
  trackingLocation: string
  showLike?: boolean
}) {
  const { onReplyClick, comment, showLike, contract, trackingLocation } = props
  const user = useUser()
  const privateUser = usePrivateUser()

  const isBountiedQuestion = contract.outcomeType === 'BOUNTIED_QUESTION'
  const canGiveBounty =
    isBountiedQuestion &&
    user &&
    user.id == contract.creatorId &&
    comment.userId != user.id

  return (
    <Row className="grow items-center justify-end">
      {canGiveBounty && (
        <AwardBountyButton
          contract={contract}
          comment={comment}
          user={user}
          disabled={contract.bountyLeft <= 0}
          buttonClassName={'mr-1'}
        />
      )}
      {user && onReplyClick && (
        <Tooltip text="Reply" placement="bottom">
          <IconButton
            size={'xs'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onReplyClick(comment)
            }}
            className={'text-ink-500'}
          >
            <ReplyIcon className="h-5 w-5 " />
          </IconButton>
        </Tooltip>
      )}
      {showLike && (
        <LikeButton
          contentCreatorId={comment.userId}
          contentId={comment.id}
          user={user}
          contentType={'comment'}
          totalLikes={comment.likes ?? 0}
          contract={contract}
          size={'xs'}
          contentText={richTextToString(comment.content)}
          className={
            isBlocked(privateUser, comment.userId) ? 'pointer-events-none' : ''
          }
          trackingLocation={trackingLocation}
        />
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
  replyToAnswerId?: string
  replyToBet?: Bet
  replyToUserInfo?: ReplyToUserInfo
  parentCommentId?: string
  clearReply?: () => void
  trackingLocation: string
}) {
  const user = useUser()
  const privateUser = usePrivateUser()
  const {
    contract,
    replyToBet,
    replyToAnswerId,
    parentCommentId,
    replyToUserInfo,
    className,
    clearReply,
    trackingLocation,
  } = props
  const onSubmitComment = useEvent(async (editor: Editor) => {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    await createCommentOnContract({
      contractId: contract.id,
      content: editor.getJSON(),
      replyToAnswerId: replyToAnswerId,
      replyToCommentId: parentCommentId,
      replyToBetId: replyToBet?.id,
    })
    clearReply?.()
    track('comment', {
      location: trackingLocation,
      replyTo: replyToAnswerId
        ? 'answer'
        : replyToBet
        ? 'bet'
        : replyToUserInfo
        ? 'user'
        : undefined,
    })
  })

  return (
    <CommentInput
      contract={contract}
      replyToUserInfo={replyToUserInfo}
      replyToBet={replyToBet}
      parentAnswerOutcome={replyToAnswerId}
      parentCommentId={parentCommentId}
      onSubmitComment={onSubmitComment}
      clearReply={clearReply}
      pageId={contract.id}
      className={className}
      blocked={isBlocked(privateUser, contract.creatorId)}
      size={contract.outcomeType == 'BOUNTIED_QUESTION' ? 'xs' : undefined}
    />
  )
}

function FeedCommentHeader(props: {
  comment: ContractComment
  contract: Contract
  inTimeline?: boolean
  isParent?: boolean
}) {
  const { comment, contract, inTimeline } = props
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
              username={userUsername}
              name={userName}
              marketCreator={marketCreator}
              className={'font-semibold'}
            />
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
          {!inTimeline && <DotMenu comment={comment} contract={contract} />}
        </Row>
        {bountyAwarded && bountyAwarded > 0 && (
          <span className="select-none text-teal-600 dark:text-teal-400">
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

function FeedCommentReplyHeader(props: {
  comment: ContractComment
  contract: Contract
}) {
  const { comment, contract } = props
  const { bettorName, bettorUsername, betOutcome, betAnswerId, betAmount } =
    comment
  if (!bettorUsername || !bettorName || !betOutcome || !betAmount) return null
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
    <Row className="ml-4 text-sm">
      <Col className="h-grow justify-end">
        <div className="border-ink-300 h-4 w-6 rounded-tl-lg border-2 border-r-0 border-b-0" />
      </Col>
      <Row className="bg-ink-200 text-ink-600 gap-1 whitespace-nowrap py-1 px-4">
        <UserLink
          username={bettorUsername}
          name={bettorName}
          marketCreator={false}
        />
        {bought} <span className="text-ink-1000">{money}</span> of
        <OutcomeLabel
          outcome={betOutcome ? betOutcome : ''}
          answerId={betAnswerId}
          contract={contract}
          truncate="short"
        />
        {clearReply && (
          <button onClick={clearReply}>
            <XCircleIcon className={'absolute -top-1.5 -right-3 h-5 w-5'} />
          </button>
        )}
      </Row>
    </Row>
  )
}
