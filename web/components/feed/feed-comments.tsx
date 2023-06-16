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
import { getFormattedMappedValue } from 'common/pseudo-numeric'
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
} from 'web/components/feed/copy-link-date-time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { OutcomeLabel } from 'web/components/outcome-label'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { useEvent } from 'web/hooks/use-event'
import { useHashInUrl } from 'web/hooks/use-hash-in-url'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { createCommentOnContract, hideComment } from 'web/lib/firebase/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import LinkIcon from 'web/lib/icons/link-icon'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon'
import TriangleFillIcon from 'web/lib/icons/triangle-fill-icon'
import { track } from 'web/lib/service/analytics'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import Curve from 'web/public/custom-components/curve'
import { Button, IconButton } from '../buttons/button'
import { CommentInput } from '../comments/comment-input'
import { ReplyToggle } from '../comments/reply-toggle'
import { Content } from '../widgets/editor'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { CommentEditHistoryButton } from '../comments/comment-edit-history-button'

export type ReplyToUserInfo = { id: string; username: string }
export const isReplyToBet = (comment: ContractComment) =>
  comment.bettorUsername !== undefined

export function FeedCommentThread(props: {
  contract: Contract
  threadComments: ContractComment[]
  parentComment: ContractComment
  trackingLocation: string
  collapseMiddle?: boolean
  inTimeline?: boolean
}) {
  const {
    contract,
    threadComments,
    parentComment,
    collapseMiddle,
    trackingLocation,
    inTimeline,
  } = props
  const [replyToUserInfo, setReplyToUserInfo] = useState<ReplyToUserInfo>()
  const [seeReplies, setSeeReplies] = useState(true)

  const idInUrl = useHashInUrl()

  const onSeeRepliesClick = useEvent(() => setSeeReplies(!seeReplies))
  const clearReply = useEvent(() => setReplyToUserInfo(undefined))
  const onReplyClick = useEvent((comment: ContractComment) => {
    setReplyToUserInfo({ id: comment.id, username: comment.userUsername })
  })
  const [collapseToIndex, setCollapseToIndex] = useState<number>(
    collapseMiddle && threadComments.length > 2 ? threadComments.length - 2 : -1
  )
  return (
    <Col className="w-full items-stretch gap-3">
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
      />
      {seeReplies &&
        threadComments.map((comment, _commentIdx) =>
          _commentIdx < collapseToIndex ? null : _commentIdx ===
            collapseToIndex ? (
            <Row
              className={'justify-end sm:mt-1 sm:-mb-2'}
              key={parentComment.id + 'see-replies-feed-button'}
            >
              <Button
                size={'xs'}
                color={'gray-white'}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setCollapseToIndex(-1)
                }}
              >
                <Col>
                  <TriangleFillIcon className={'mr-2 h-2'} />
                  <TriangleDownFillIcon className={'mr-2 h-2'} />
                </Col>
                See {threadComments.length - 1} replies
              </Button>
            </Row>
          ) : (
            <FeedComment
              key={comment.id}
              contract={contract}
              comment={comment}
              highlighted={idInUrl === comment.id}
              showLike={true}
              onReplyClick={onReplyClick}
              trackingLocation={trackingLocation}
            />
          )
        )}
      {replyToUserInfo && (
        <Col className="-pb-2 relative ml-6">
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
  onReplyClick?: (comment: ContractComment) => void
  children?: ReactNode
  className?: string
  inTimeline?: boolean
}) {
  const {
    contract,
    className,
    comment,
    highlighted,
    showLike,
    onReplyClick,
    children,
    trackingLocation,
    inTimeline,
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
    <Row
      ref={ref}
      className={clsx(
        className ? className : 'ml-9 gap-2',
        highlighted ? 'bg-primary-50' : '',
        isReplyToBet(comment) ? 'mt-6 sm:mt-2' : ''
      )}
    >
      <Avatar
        username={userUsername}
        avatarUrl={userAvatarUrl}
        className={clsx(marketCreator ? 'shadow shadow-amber-300' : '', 'z-10')}
      />
      <Col className="w-full">
        {isReplyToBet(comment) && (
          <FeedCommentReplyHeader comment={comment} contract={contract} />
        )}
        <FeedCommentHeader
          comment={comment}
          contract={contract}
          inTimeline={inTimeline}
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
  } = props
  const { userUsername } = comment
  const { ref } = useIsVisible(
    () =>
      track('view comment thread', {
        contractId: contract.id,
        commentId: comment.id,
      } as CommentView),
    true
  )
  const commentKind = userUsername === 'ManifoldDream' ? 'ub-dream-comment' : ''
  return (
    <FeedComment
      contract={contract}
      comment={comment}
      onReplyClick={onReplyClick}
      highlighted={highlighted}
      showLike={showLike}
      className={clsx('gap-2', commentKind)}
      trackingLocation={trackingLocation}
      inTimeline={inTimeline}
    >
      <div ref={ref} />
      <ReplyToggle
        seeReplies={seeReplies}
        numComments={numReplies}
        onClick={onSeeReplyClick}
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
        Icon={<DotsHorizontalIcon className="h-4 w-4" aria-hidden="true" />}
        Items={buildArray(
          {
            name: 'Copy Link',
            icon: <LinkIcon className="h-5 w-5" />,
            onClick: () => {
              copyLinkToComment(
                contract.creatorUsername,
                contract.slug,
                comment.id
              )
            },
          },
          user && {
            name: 'Report',
            icon: <FlagIcon className="h-5 w-5" />,
            onClick: () => {
              if (user?.id !== comment.userId) setIsModalOpen(true)
              else toast.error(`You can't report your own comment`)
            },
          },
          comment.userId === user?.id && {
            name: 'Edit',
            icon: <PencilIcon className="h-5 w-5" />,
            onClick: async () => {
              setEditingComment(true)
            },
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
    </>
  )
}

export function CommentActions(props: {
  onReplyClick?: (comment: ContractComment) => void
  comment: ContractComment
  contract: Contract
  trackingLocation: string
  showLike?: boolean
}) {
  const { onReplyClick, comment, showLike, contract, trackingLocation } = props
  const user = useUser()
  const privateUser = usePrivateUser()

  return (
    <Row className="grow items-center justify-end">
      {user && onReplyClick && (
        <Tooltip text="Reply" placement="bottom">
          <IconButton
            size={'xs'}
            onClick={(e) => {
              e.preventDefault()
              onReplyClick(comment)
            }}
          >
            <ReplyIcon className="h-5 w-5" />
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
          contentText={richTextToString(comment.content)}
          className={
            isBlocked(privateUser, comment.userId) ? 'pointer-events-none' : ''
          }
          size={'md'}
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
  const { resolutionTime, resolution } = contract
  const isStonk = contract.outcomeType === 'STONK'
  const {
    commenterPositionProb: prob,
    commenterPositionOutcome,
    commenterPositionShares,
    createdTime,
  } = comment

  if (
    comment.betId == null &&
    prob != null &&
    commenterPositionOutcome != null &&
    commenterPositionShares != null &&
    commenterPositionShares > 0 &&
    contract.outcomeType !== 'NUMERIC'
  )
    return (
      <>
        {resolution
          ? 'predicted '
          : `is ${isStonk ? 'holding' : 'predicting'} `}
        <OutcomeLabel
          outcome={commenterPositionOutcome}
          contract={contract}
          truncate="short"
        />
        {(resolutionTime ? resolutionTime > createdTime : true) &&
          ' at ' + getFormattedMappedValue(contract, prob)}
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
    />
  )
}

function FeedCommentHeader(props: {
  comment: ContractComment
  contract: Contract
  inTimeline?: boolean
}) {
  const { comment, contract, inTimeline } = props
  const {
    userUsername,
    userName,
    createdTime,
    editedTime,
    bettorUsername,
    betOutcome,
    answerOutcome,
    betAmount,
    userId,
    isApi,
  } = comment

  const marketCreator = contract.creatorId === userId
  const { bought, money } = getBoughtMoney(betAmount)
  const shouldDisplayOutcome = betOutcome && !answerOutcome
  return (
    <Col
      className={clsx('mt-1', inTimeline ? 'text-md' : 'text-ink-600 text-sm ')}
    >
      <Row className="items-end">
        <UserLink
          username={userUsername}
          name={userName}
          marketCreator={marketCreator}
          className={'font-semibold'}
        />
        {/* Hide my status if replying to a bet, it's too much clutter*/}
        {bettorUsername == undefined && !inTimeline && (
          <span className="text-ink-400 ml-1">
            <CommentStatus contract={contract} comment={comment} />
            {bought} {money}
            {shouldDisplayOutcome && (
              <>
                {' '}
                of{' '}
                <OutcomeLabel
                  outcome={betOutcome ? betOutcome : ''}
                  contract={contract}
                  truncate="short"
                />
              </>
            )}
          </span>
        )}
        {inTimeline && <span> commented</span>}{' '}
        <CopyLinkDateTimeComponent
          prefix={contract.creatorUsername}
          slug={contract.slug}
          createdTime={editedTime ? editedTime : createdTime}
          elementId={comment.id}
          seeEditsButton={<CommentEditHistoryButton comment={comment} />}
        />
        {isApi && (
          <InfoTooltip text="Placed via API" className="mr-1">
            🤖
          </InfoTooltip>
        )}
        <DotMenu comment={comment} contract={contract} />
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
  const { bettorName, bettorUsername, betOutcome, betAmount } = comment
  if (!bettorUsername || !bettorName || !betOutcome || !betAmount) return null
  return (
    <CommentOnBetRow
      betOutcome={betOutcome}
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
  clearReply?: () => void
  className?: string
}) {
  const {
    betOutcome,
    betAmount,
    bettorName,
    bettorUsername,
    contract,
    clearReply,
    className,
  } = props
  const { bought, money } = getBoughtMoney(betAmount)

  return (
    <Row className={clsx('relative w-full', className)}>
      <Row className={'absolute -top-8 -left-10  text-sm'}>
        <Row className="relative">
          <div className="absolute -bottom-2 left-1.5">
            <Curve size={32} strokeWidth={1} color="#D8D8EB" />
          </div>
          <Row className="bg-canvas-100 ml-[38px] gap-1 whitespace-nowrap rounded-md p-1">
            <UserLink
              username={bettorUsername}
              name={bettorName}
              marketCreator={false}
            />
            {bought} {money} of
            <OutcomeLabel
              outcome={betOutcome ? betOutcome : ''}
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
      </Row>
    </Row>
  )
}
