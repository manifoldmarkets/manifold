import {
  DotsHorizontalIcon,
  EyeOffIcon,
  FlagIcon,
  LinkIcon,
  PencilIcon,
  PlusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/solid'
import { ThumbDownIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { isAdminId } from 'common/envs/constants'
import { buildArray } from 'common/util/array'
import { formatPercent, formatWithToken } from 'common/util/format'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { BiRepost } from 'react-icons/bi'
import { PiPushPinBold } from 'react-icons/pi'
import { TiPin } from 'react-icons/ti'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { api } from 'web/lib/api/api'
import { PaymentsModal } from 'web/pages/payments'
import TipJar from 'web/public/custom-components/tipJar'
import { AnnotateChartModal } from '../annotate-chart'
import { MoneyDisplay } from '../bet/money-display'
import { ReportModal } from '../buttons/report-button'
import { CommentOnAnswer } from '../feed/comment-on-answer'
import {
  CopyLinkDateTimeComponent,
  copyLinkToComment,
  getCommentLink,
} from '../feed/copy-link-date-time'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { OutcomeLabel } from '../outcome-label'
import { UserHovercard } from '../user/user-hovercard'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'
import { commenterAndBettorMatch, roundThreadColor } from './comment'
import { CommentEditHistoryButton } from './comment-edit-history-button'
import DropdownMenu from '../widgets/dropdown-menu'
import { EditCommentModal } from './edit-comment-modal'
import { type Answer } from 'common/answer'
import { useAnswer, useLiveAnswer } from 'web/hooks/use-answers'

export function FeedCommentHeader(props: {
  comment: ContractComment
  playContract: Contract
  menuProps?: {
    liveContractId: string
    updateComment: (comment: Partial<ContractComment>) => void
  }
  inTimeline?: boolean
  isParent?: boolean
  isPinned?: boolean
  className?: string
}) {
  const { comment, playContract, menuProps, inTimeline, isPinned, className } =
    props

  const {
    userUsername,
    userName,
    createdTime,
    editedTime,
    betOutcome,
    betAnswerId,
    answerOutcome,
    betAmount,
    userId,
    isApi,
    bountyAwarded,
    isRepost,
    betOrderAmount,
    betLimitProb,
    betToken,
  } = comment

  const betOnCashContract = betToken === 'CASH'
  const marketCreator = playContract.creatorId === userId
  const { bought, money } = getBoughtMoney(betAmount, betOnCashContract)
  const shouldDisplayOutcome = betOutcome && !answerOutcome
  const answer = useLiveAnswer(betAnswerId)

  const isReplyToBet = betAmount !== undefined
  const commenterIsBettor = commenterAndBettorMatch(comment)
  const isLimitBet = betOrderAmount !== undefined && betLimitProb !== undefined
  return (
    <Col className={clsx('text-ink-600 text-sm', className)}>
      <Row className="items-start justify-between">
        <span className="items-center gap-x-1">
          <UserHovercard userId={userId}>
            <UserLink
              user={{
                id: userId,
                name: userName,
                username: userUsername,
              }}
              marketCreator={inTimeline ? false : marketCreator}
              className={'font-semibold'}
            />
          </UserHovercard>
          {!commenterIsBettor || !isReplyToBet ? null : isLimitBet ? (
            <span className={'ml-1'}>
              {betAmount === betOrderAmount ? 'filled' : 'opened'} a{' '}
              <span className="text-ink-1000">
                <MoneyDisplay
                  amount={betOrderAmount}
                  isCashContract={betOnCashContract}
                />
              </span>{' '}
              <OutcomeLabel
                outcome={betOutcome || ''}
                answer={answer}
                contract={playContract}
                truncate="short"
              />{' '}
              at {formatPercent(betLimitProb)} order
            </span>
          ) : (
            <span>
              {bought} <span className="text-ink-1000">{money}</span>{' '}
              <OutcomeLabel
                outcome={betOutcome || ''}
                answer={answer}
                contract={playContract}
                truncate="short"
              />
            </span>
          )}
          {isRepost && !inTimeline && (
            <span>
              <Tooltip text={'Reposted to followers'}>
                <BiRepost className=" inline h-4 w-4" />
                {commenterIsBettor ? '' : ' reposted'}
              </Tooltip>
            </span>
          )}
          {/* Hide my status if replying to a bet, it's too much clutter*/}
          {!isReplyToBet && !inTimeline && (
            <span className="text-ink-500">
              <CommentStatus contract={playContract} comment={comment} />
              {bought} {money}
              {shouldDisplayOutcome && (
                <>
                  {' '}
                  of{' '}
                  <OutcomeLabel
                    outcome={betOutcome || ''}
                    answer={answer}
                    contract={playContract}
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
              prefix={playContract.creatorUsername}
              slug={playContract.slug}
              createdTime={editedTime ? editedTime : createdTime}
              elementId={comment.id}
              size={'sm'}
              linkClassName="text-ink-500"
            />
          )}
          {!inTimeline && isApi && (
            <InfoTooltip text="Placed via API">🤖</InfoTooltip>
          )}
        </span>
        <Row className="gap-1">
          {!inTimeline && menuProps && (
            <DotMenu
              comment={comment}
              playContract={playContract}
              updateComment={menuProps.updateComment}
              liveContractId={menuProps.liveContractId}
            />
          )}
          {bountyAwarded && bountyAwarded > 0 && (
            <span className="select-none text-teal-600">
              +
              <MoneyDisplay amount={bountyAwarded} isCashContract={false} />
            </span>
          )}
          {isPinned && <TiPin className="text-primary-500 inline h-4 w-4" />}
        </Row>
      </Row>
    </Col>
  )
}

const getBoughtMoney = (
  betAmount: number | undefined,
  isCashContract: boolean
) => {
  let bought: string | undefined
  let money: string | undefined
  if (betAmount != undefined) {
    bought = betAmount >= 0 ? ' bought' : ' sold'
    money = formatWithToken({
      amount: Math.abs(betAmount),
      token: isCashContract ? 'CASH' : 'M$',
    })
  }
  return { bought, money }
}

export function CommentReplyHeaderWithBet(props: {
  comment: ContractComment
  contract: Pick<Contract, 'outcomeType' | 'mechanism'>
  bet: Bet
}) {
  const { comment, contract, bet } = props
  const { outcome, answerId, amount, orderAmount, limitProb } = bet
  return (
    <CommentReplyHeader
      comment={{
        ...comment,
        betOutcome: outcome,
        betAmount: amount,
        betOrderAmount: orderAmount,
        betLimitProb: limitProb,
        answerOutcome: answerId,
      }}
      contract={contract}
    />
  )
}

export function CommentReplyHeader(props: {
  comment: ContractComment
  contract: Pick<Contract, 'outcomeType' | 'mechanism'>
  hideBetHeader?: boolean
}) {
  const { comment, contract, hideBetHeader } = props
  const {
    bettorName,
    bettorId,
    bettorUsername,
    betOutcome,
    betAnswerId,
    betAmount,
    answerOutcome,
    betOrderAmount,
    betLimitProb,
  } = comment

  const { answer: betAnswer } = useAnswer(betAnswerId)
  const { answer: answerToReply } = useAnswer(answerOutcome)

  if (
    (bettorId || (bettorUsername && bettorName)) &&
    betOutcome &&
    betAmount !== undefined &&
    !hideBetHeader
  ) {
    return (
      <ReplyToBetRow
        bettorId={bettorId}
        contract={contract}
        commenterIsBettor={commenterAndBettorMatch(comment)}
        betOutcome={betOutcome}
        bettorName={bettorName}
        bettorUsername={bettorUsername}
        betAnswer={betAnswer}
        betAmount={betAmount}
        betOrderAmount={betOrderAmount}
        betLimitProb={betLimitProb}
      />
    )
  }
  if (answerToReply) {
    return <CommentOnAnswer answer={answerToReply} />
  }

  return null
}

export function ReplyToBetRow(props: {
  contract: Pick<Contract, 'outcomeType' | 'mechanism'>
  commenterIsBettor: boolean
  betOutcome: string
  betAmount: number
  bettorId?: string
  bettorName?: string
  bettorUsername?: string
  betOrderAmount?: number
  betLimitProb?: number
  betAnswer?: Answer
  clearReply?: () => void
}) {
  const {
    betOutcome,
    commenterIsBettor,
    betAmount,
    bettorUsername,
    bettorName,
    bettorId,
    betAnswer,
    contract,
    clearReply,
    betLimitProb,
    betOrderAmount,
  } = props
  const isCashContract = false
  const { bought, money } = getBoughtMoney(betAmount, isCashContract)
  const user = useDisplayUserById(bettorId)

  const isLimitBet = betOrderAmount !== undefined && betLimitProb !== undefined
  const isMobile = useIsMobile()
  return (
    <Row className="mb-1 ml-4 items-end pr-2 text-sm">
      <div
        className={clsx(
          roundThreadColor,
          '-mb-1 h-5 w-6 rounded-tl-xl border-2 border-b-0 border-r-0'
        )}
      />
      <Row
        className={clsx(
          'bg-canvas-50 text-ink-600 relative items-center gap-1 px-2 py-1',
          isLimitBet ? 'flex-wrap' : 'whitespace-nowrap'
        )}
      >
        {!commenterIsBettor && bettorId && (
          <UserHovercard userId={bettorId}>
            <UserLink
              short={(isLimitBet || betAnswer) && isMobile}
              user={user}
            />
          </UserHovercard>
        )}
        {!commenterIsBettor && !bettorId && bettorName && bettorUsername && (
          <UserLink
            short={(isLimitBet || betAnswer) && isMobile}
            user={{
              id: bettorId ?? bettorName + bettorUsername,
              name: bettorName,
              username: bettorUsername,
            }}
          />
        )}
        {isLimitBet ? (
          <>
            {betAmount === betOrderAmount
              ? commenterIsBettor
                ? 'Filled'
                : 'filled'
              : commenterIsBettor
              ? 'Opened'
              : 'opened'}{' '}
            a
            <span className="text-ink-1000">
              <MoneyDisplay
                amount={betOrderAmount}
                isCashContract={isCashContract}
              />
            </span>
            <OutcomeLabel
              outcome={betOutcome || ''}
              answer={betAnswer}
              contract={contract}
              truncate="short"
            />{' '}
            at {formatPercent(betLimitProb)} order
          </>
        ) : (
          <>
            {bought}
            <span className="text-ink-1000">{money}</span>
            <OutcomeLabel
              outcome={betOutcome || ''}
              answer={betAnswer}
              contract={contract}
              truncate="short"
            />
          </>
        )}
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

function CommentStatus(props: {
  contract: Pick<Contract, 'outcomeType' | 'mechanism'>
  comment: ContractComment
}) {
  const { contract, comment } = props
  const {
    commenterPositionProb,
    commenterPositionOutcome,
    commenterPositionAnswerId,
    commenterPositionShares,
  } = comment

  const { answer } = useAnswer(commenterPositionAnswerId)

  if (
    comment.betId == null &&
    commenterPositionProb != null &&
    commenterPositionOutcome != null &&
    commenterPositionShares != null &&
    commenterPositionShares > 0
  )
    return (
      <>
        predicted
        <OutcomeLabel
          outcome={commenterPositionOutcome}
          answer={answer}
          contract={contract}
          truncate="short"
        />
      </>
    )

  return <span />
}

function DotMenu(props: {
  comment: ContractComment
  updateComment: (update: Partial<ContractComment>) => void
  playContract: Contract
  liveContractId: string
}) {
  const { comment, updateComment, playContract, liveContractId } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const user = useUser()
  const privateUser = usePrivateUser()
  const isMod = useAdminOrMod()
  const isContractCreator = privateUser?.id === playContract.creatorId
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
          parentId: playContract.id,
          parentType: 'contract',
        }}
        setIsModalOpen={setIsModalOpen}
        isModalOpen={isModalOpen}
        label={'Comment'}
      />
      <DropdownMenu
        menuWidth={'w-36'}
        buttonContent={
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
                playContract.creatorUsername,
                playContract.slug,
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
              name: 'Dislike',
              icon: <ThumbDownIcon className="h-5 w-5" />,
              onClick: async () => {
                toast.promise(
                  api('react', {
                    contentId: comment.id,
                    contentType: 'comment',
                    reactionType: 'dislike',
                  }),
                  {
                    loading: 'Disliking comment...',
                    success: 'Comment disliked',
                    error: 'Failed to dislike comment',
                  }
                )
              },
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
              const commentPath = `contracts/${playContract.id}/comments/${comment.id}`
              const wasHidden = comment.hidden
              updateComment({ hidden: !wasHidden })

              try {
                await api('hide-comment', { commentPath })
              } catch (e) {
                toast.error(
                  wasHidden ? 'Error unhiding comment' : 'Error hiding comment'
                )
                console.error(e)
                // undo optimistic update
                updateComment({ hidden: wasHidden })
              }
            },
          },
          (isMod || isContractCreator) && {
            name: comment.pinned ? 'Unpin' : 'Pin',
            icon: <PiPushPinBold className="text-primary-500 h-5 w-5" />,
            onClick: async () => {
              const commentPath = `contracts/${playContract.id}/comments/${comment.id}`
              const wasPinned = comment.pinned
              updateComment({ pinned: !wasPinned })

              try {
                await api('pin-comment', { commentPath })
              } catch (e) {
                console.error(e)
                toast.error(
                  wasPinned ? 'Error pinning comment' : 'Error pinning comment'
                )
                // undo optimistic update
                updateComment({ pinned: wasPinned })
              }
            },
          }
        )}
      />
      {annotating && (
        <AnnotateChartModal
          open={annotating}
          setOpen={setAnnotating}
          contractId={liveContractId}
          atTime={comment.createdTime}
          comment={comment}
        />
      )}
      {user && editingComment && (
        <EditCommentModal
          user={user}
          comment={comment}
          setContent={(content) => updateComment({ content })}
          contract={playContract}
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
            playContract.question
          } ${getCommentLink(
            playContract.creatorUsername,
            playContract.slug,
            comment.id
          )}`}
        />
      )}
    </>
  )
}
