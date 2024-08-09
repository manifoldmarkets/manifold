import {
  DotsHorizontalIcon,
  LinkIcon,
  FlagIcon,
  PencilIcon,
  PlusCircleIcon,
  EyeOffIcon,
  ReplyIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { isAdminId } from 'common/envs/constants'
import { buildArray } from 'common/util/array'
import { richTextToString } from 'common/util/parse'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { BiRepost } from 'react-icons/bi'
import { FaArrowTrendUp, FaArrowTrendDown } from 'react-icons/fa6'
import { PiPushPinBold } from 'react-icons/pi'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useUser, usePrivateUser, isBlocked } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { PaymentsModal } from 'web/pages/payments'
import TipJar from 'web/public/custom-components/tipJar'
import { AnnotateChartModal } from '../annotate-chart'
import { BuyPanel } from '../bet/bet-panel'
import { IconButton } from '../buttons/button'
import { ReportModal } from '../buttons/report-button'
import { AwardBountyButton } from '../contract/bountied-question'
import { LikeButton } from '../contract/like-button'
import { copyLinkToComment, getCommentLink } from '../feed/copy-link-date-time'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'
import DropdownMenu from './dropdown-menu'
import { EditCommentModal } from './edit-comment-modal'
import { RepostModal } from './repost-modal'
import { track } from 'web/lib/service/analytics'

export function DotMenu(props: {
  comment: ContractComment
  updateComment: (update: Partial<ContractComment>) => void
  contract: Contract
}) {
  const { comment, updateComment, contract } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const user = useUser()
  const privateUser = usePrivateUser()
  const isMod = useAdminOrMod()
  const isContractCreator = privateUser?.id === contract.creatorId
  const [editingComment, setEditingComment] = useState(false)
  const [tipping, setTipping] = useState(false)
  const [reposting, setReposting] = useState(false)
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
          user && {
            name: 'Repost',
            icon: <BiRepost className="h-5 w-5" />,
            onClick: () => setReposting(true),
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
          },
          (isMod || isContractCreator) && {
            name: comment.pinned ? 'Unpin' : 'Pin',
            icon: <PiPushPinBold className="text-primary-500 h-5 w-5" />,
            onClick: async () => {
              const commentPath = `contracts/${contract.id}/comments/${comment.id}`
              const wasPinned = comment.pinned
              updateComment({ pinned: !wasPinned })

              try {
                await api('pin-comment', { commentPath })
              } catch (e) {
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
          contractId={contract.id}
          atTime={comment.createdTime}
          comment={comment}
        />
      )}
      {user && reposting && (
        <RepostModal
          contract={contract}
          open={reposting}
          setOpen={setReposting}
          comment={comment}
          bet={
            comment.betId
              ? ({
                  amount: comment.betAmount,
                  outcome: comment.betOutcome,
                  limitProb: comment.betLimitProb,
                  orderAmount: comment.betOrderAmount,
                  id: comment.betId,
                } as Bet)
              : undefined
          }
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

export function CommentActions(props: {
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
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)
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
