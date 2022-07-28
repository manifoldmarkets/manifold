import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import React, { useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { UserLink } from 'web/components/user-page'
import { Linkify } from 'web/components/linkify'
import clsx from 'clsx'
import {
  CommentInput,
  CommentRepliesList,
  getMostRecentCommentableBet,
} from 'web/components/feed/feed-comments'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { groupBy } from 'lodash'
import { User } from 'common/user'
import { useEvent } from 'web/hooks/use-event'
import { CommentTipMap } from 'web/hooks/use-tip-txns'

export function FeedAnswerCommentGroup(props: {
  contract: any
  user: User | undefined | null
  answer: Answer
  comments: Comment[]
  tips: CommentTipMap
  bets: Bet[]
}) {
  const { answer, contract, comments, tips, bets, user } = props
  const { username, avatarUrl, name, text } = answer

  const [replyToUsername, setReplyToUsername] = useState('')
  const [showReply, setShowReply] = useState(false)
  const [inputRef, setInputRef] = useState<HTMLTextAreaElement | null>(null)
  const [highlighted, setHighlighted] = useState(false)
  const router = useRouter()

  const answerElementId = `answer-${answer.id}`
  const betsByUserId = groupBy(bets, (bet) => bet.userId)
  const commentsByUserId = groupBy(comments, (comment) => comment.userId)
  const commentsList = comments.filter(
    (comment) => comment.answerOutcome === answer.number.toString()
  )
  const betsByCurrentUser = (user && betsByUserId[user.id]) ?? []
  const commentsByCurrentUser = (user && commentsByUserId[user.id]) ?? []
  const isFreeResponseContractPage = !!commentsByCurrentUser
  const mostRecentCommentableBet = getMostRecentCommentableBet(
    betsByCurrentUser,
    commentsByCurrentUser,
    user,
    answer.number.toString()
  )
  const [usersMostRecentBetTimeAtLoad, setUsersMostRecentBetTimeAtLoad] =
    useState<number | undefined>(
      !user ? undefined : mostRecentCommentableBet?.createdTime ?? 0
    )

  useEffect(() => {
    if (user && usersMostRecentBetTimeAtLoad === undefined)
      setUsersMostRecentBetTimeAtLoad(
        mostRecentCommentableBet?.createdTime ?? 0
      )
  }, [
    mostRecentCommentableBet?.createdTime,
    user,
    usersMostRecentBetTimeAtLoad,
  ])

  const scrollAndOpenReplyInput = useEvent(
    (comment?: Comment, answer?: Answer) => {
      setReplyToUsername(comment?.userUsername ?? answer?.username ?? '')
      setShowReply(true)
      inputRef?.focus()
    }
  )

  useEffect(() => {
    // Only show one comment input for a bet at a time
    if (
      betsByCurrentUser.length > 1 &&
      inputRef?.textContent?.length === 0 &&
      betsByCurrentUser.sort((a, b) => b.createdTime - a.createdTime)[0]
        ?.outcome !== answer.number.toString()
    )
      setShowReply(false)
    // Even if we pass memoized bets this still runs on every render, which we don't want
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betsByCurrentUser.length, user, answer.number])

  useEffect(() => {
    if (showReply && inputRef) inputRef.focus()
  }, [inputRef, showReply])

  useEffect(() => {
    if (router.asPath.endsWith(`#${answerElementId}`)) {
      setHighlighted(true)
    }
  }, [answerElementId, router.asPath])

  return (
    <Col className={'relative flex-1 gap-3'} key={answer.id + 'comment'}>
      <Row
        className={clsx(
          'flex gap-3 space-x-3 pt-4 transition-all duration-1000',
          highlighted ? `-m-2 my-3 rounded bg-indigo-500/[0.2] p-2` : ''
        )}
        id={answerElementId}
      >
        <Avatar username={username} avatarUrl={avatarUrl} />

        <Col className="min-w-0 flex-1 lg:gap-1">
          <div className="text-sm text-gray-500">
            <UserLink username={username} name={name} /> answered
            <CopyLinkDateTimeComponent
              prefix={contract.creatorUsername}
              slug={contract.slug}
              createdTime={answer.createdTime}
              elementId={answerElementId}
            />
          </div>

          <Col className="align-items justify-between gap-2 sm:flex-row">
            <span className="whitespace-pre-line text-lg">
              <Linkify text={text} />
            </span>

            {isFreeResponseContractPage && (
              <div className={'sm:hidden'}>
                <button
                  className={'text-xs font-bold text-gray-500 hover:underline'}
                  onClick={() => scrollAndOpenReplyInput(undefined, answer)}
                >
                  Reply
                </button>
              </div>
            )}
          </Col>
          {isFreeResponseContractPage && (
            <div className={'justify-initial hidden sm:block'}>
              <button
                className={'text-xs font-bold text-gray-500 hover:underline'}
                onClick={() => scrollAndOpenReplyInput(undefined, answer)}
              >
                Reply
              </button>
            </div>
          )}
        </Col>
      </Row>
      <CommentRepliesList
        contract={contract}
        commentsList={commentsList}
        betsByUserId={betsByUserId}
        smallAvatar={true}
        truncate={false}
        bets={bets}
        tips={tips}
        scrollAndOpenReplyInput={scrollAndOpenReplyInput}
        treatFirstIndexEqually={true}
      />

      {showReply && (
        <div className={'ml-6'}>
          <span
            className="absolute -ml-[1px] mt-[1.25rem] h-2 w-0.5 rotate-90 bg-gray-200"
            aria-hidden="true"
          />
          <CommentInput
            contract={contract}
            betsByCurrentUser={betsByCurrentUser}
            commentsByCurrentUser={commentsByCurrentUser}
            parentAnswerOutcome={answer.number.toString()}
            replyToUsername={replyToUsername}
            setRef={setInputRef}
            onSubmitComment={() => {
              setShowReply(false)
              setReplyToUsername('')
            }}
          />
        </div>
      )}
    </Col>
  )
}
