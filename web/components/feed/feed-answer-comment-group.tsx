import { FreeResponse, FullContract } from 'common/contract'
import { Answer } from 'common/answer'
import { ActivityItem } from 'web/components/feed/activity-items'
import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import { useUser } from 'web/hooks/use-user'
import { getDpmOutcomeProbability } from 'common/calculate-dpm'
import { formatPercent } from 'common/util/format'
import React, { useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { AnswerBetPanel } from 'web/components/answers/answer-bet-panel'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { UserLink } from 'web/components/user-page'
import { Linkify } from 'web/components/linkify'
import clsx from 'clsx'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { BuyButton } from 'web/components/yes-no-selector'
import { FeedItem } from 'web/components/feed/feed-items'
import {
  CommentInput,
  getMostRecentCommentableBet,
} from 'web/components/feed/feed-comments'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'

export function FeedAnswerCommentGroup(props: {
  contract: FullContract<any, FreeResponse>
  answer: Answer
  items: ActivityItem[]
  type: string
  betsByCurrentUser?: Bet[]
  commentsByCurrentUser?: Comment[]
}) {
  const { answer, items, contract, betsByCurrentUser, commentsByCurrentUser } =
    props
  const { username, avatarUrl, name, text } = answer
  const answerElementId = `answer-${answer.id}`
  const user = useUser()
  const mostRecentCommentableBet = getMostRecentCommentableBet(
    betsByCurrentUser ?? [],
    commentsByCurrentUser ?? [],
    user,
    answer.number + ''
  )
  const prob = getDpmOutcomeProbability(contract.totalShares, answer.id)
  const probPercent = formatPercent(prob)
  const [open, setOpen] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const isFreeResponseContractPage = !!commentsByCurrentUser
  if (mostRecentCommentableBet && !showReply) setShowReplyAndFocus(true)
  const [inputRef, setInputRef] = useState<HTMLTextAreaElement | null>(null)

  // If they've already opened the input box, focus it once again
  function setShowReplyAndFocus(show: boolean) {
    setShowReply(show)
    inputRef?.focus()
  }

  useEffect(() => {
    if (showReply && inputRef) inputRef.focus()
  }, [inputRef, showReply])

  const [highlighted, setHighlighted] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (router.asPath.endsWith(`#${answerElementId}`)) {
      setHighlighted(true)
    }
  }, [answerElementId, router.asPath])

  return (
    <Col className={'flex-1 gap-2'}>
      <Modal open={open} setOpen={setOpen}>
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setOpen(false)}
          className="sm:max-w-84 !rounded-md bg-white !px-8 !py-6"
          isModal={true}
        />
      </Modal>

      <Row
        className={clsx(
          'my-4 flex gap-3 space-x-3 transition-all duration-1000',
          highlighted ? `-m-2 my-3 rounded bg-indigo-500/[0.2] p-2` : ''
        )}
        id={answerElementId}
      >
        <div className="px-1">
          <Avatar username={username} avatarUrl={avatarUrl} />
        </div>
        <Col className="min-w-0 flex-1 lg:gap-1">
          <div className="text-sm text-gray-500">
            <UserLink username={username} name={name} /> answered
            <CopyLinkDateTimeComponent
              contract={contract}
              createdTime={answer.createdTime}
              elementId={answerElementId}
            />
          </div>

          <Col className="align-items justify-between gap-4 sm:flex-row">
            <span className="whitespace-pre-line text-lg">
              <Linkify text={text} />
            </span>

            <Row className="items-center justify-center gap-4">
              {isFreeResponseContractPage && (
                <div className={'sm:hidden'}>
                  <button
                    className={
                      'text-xs font-bold text-gray-500 hover:underline'
                    }
                    onClick={() => setShowReplyAndFocus(true)}
                  >
                    Reply
                  </button>
                </div>
              )}

              <div className={'align-items flex w-full justify-end gap-4 '}>
                <span
                  className={clsx(
                    'text-2xl',
                    tradingAllowed(contract) ? 'text-primary' : 'text-gray-500'
                  )}
                >
                  {probPercent}
                </span>
                <BuyButton
                  className={clsx(
                    'btn-sm flex-initial !px-6 sm:flex',
                    tradingAllowed(contract) ? '' : '!hidden'
                  )}
                  onClick={() => setOpen(true)}
                />
              </div>
            </Row>
          </Col>
          {isFreeResponseContractPage && (
            <div className={'justify-initial hidden sm:block'}>
              <button
                className={'text-xs font-bold text-gray-500 hover:underline'}
                onClick={() => setShowReplyAndFocus(true)}
              >
                Reply
              </button>
            </div>
          )}
        </Col>
      </Row>

      {items.map((item, index) => (
        <div
          key={item.id}
          className={clsx(
            'relative ml-8',
            index !== items.length - 1 && 'pb-4'
          )}
        >
          {index !== items.length - 1 ? (
            <span
              className="absolute top-5 left-5 -ml-px h-[calc(100%-1rem)] w-0.5 bg-gray-200"
              aria-hidden="true"
            />
          ) : null}
          <div className="relative flex items-start space-x-3">
            <FeedItem item={item} />
          </div>
        </div>
      ))}

      {showReply && (
        <div className={'ml-8 pt-4'}>
          <CommentInput
            contract={contract}
            betsByCurrentUser={betsByCurrentUser ?? []}
            commentsByCurrentUser={commentsByCurrentUser ?? []}
            answerOutcome={answer.number + ''}
            replyToUsername={answer.username}
            setRef={setInputRef}
          />
        </div>
      )}
    </Col>
  )
}
