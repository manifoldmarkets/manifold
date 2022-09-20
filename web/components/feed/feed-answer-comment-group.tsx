import { Answer } from 'common/answer'
import { FreeResponseContract } from 'common/contract'
import { ContractComment } from 'common/comment'
import React, { useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { Linkify } from 'web/components/linkify'
import clsx from 'clsx'
import {
  ContractCommentInput,
  FeedComment,
} from 'web/components/feed/feed-comments'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { User } from 'common/user'
import { useEvent } from 'web/hooks/use-event'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { UserLink } from 'web/components/user-link'

export function FeedAnswerCommentGroup(props: {
  contract: FreeResponseContract
  answer: Answer
  answerComments: ContractComment[]
  tips: CommentTipMap
}) {
  const { answer, contract, answerComments, tips } = props
  const { username, avatarUrl, name, text } = answer

  const [replyToUser, setReplyToUser] =
    useState<Pick<User, 'id' | 'username'>>()
  const [showReply, setShowReply] = useState(false)
  const [highlighted, setHighlighted] = useState(false)
  const router = useRouter()

  const answerElementId = `answer-${answer.id}`

  const scrollAndOpenReplyInput = useEvent(
    (comment?: ContractComment, answer?: Answer) => {
      setReplyToUser(
        comment
          ? { id: comment.userId, username: comment.userUsername }
          : answer
          ? { id: answer.userId, username: answer.username }
          : undefined
      )
      setShowReply(true)
    }
  )

  useEffect(() => {
    if (router.asPath.endsWith(`#${answerElementId}`)) {
      setHighlighted(true)
    }
  }, [answerElementId, router.asPath])

  return (
    <Col className="relative flex-1 items-stretch gap-3">
      <Row
        className={clsx(
          'gap-3 space-x-3 pt-4 transition-all duration-1000',
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
            <div className="sm:hidden">
              <button
                className="text-xs font-bold text-gray-500 hover:underline"
                onClick={() => scrollAndOpenReplyInput(undefined, answer)}
              >
                Reply
              </button>
            </div>
          </Col>
          <div className="justify-initial hidden sm:block">
            <button
              className="text-xs font-bold text-gray-500 hover:underline"
              onClick={() => scrollAndOpenReplyInput(undefined, answer)}
            >
              Reply
            </button>
          </div>
        </Col>
      </Row>
      <Col className="gap-3 pl-1">
        {answerComments.map((comment) => (
          <FeedComment
            key={comment.id}
            indent={true}
            contract={contract}
            comment={comment}
            tips={tips[comment.id]}
            onReplyClick={scrollAndOpenReplyInput}
          />
        ))}
      </Col>
      {showReply && (
        <div className="relative ml-7">
          <span
            className="absolute -left-1 -ml-[1px] mt-[1.25rem] h-2 w-0.5 rotate-90 bg-gray-200"
            aria-hidden="true"
          />
          <ContractCommentInput
            contract={contract}
            parentAnswerOutcome={answer.number.toString()}
            replyToUser={replyToUser}
            onSubmitComment={() => setShowReply(false)}
          />
        </div>
      )}
    </Col>
  )
}
