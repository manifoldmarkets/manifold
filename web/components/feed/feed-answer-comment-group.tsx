import { Answer } from 'common/answer'
import { Contract } from 'common/contract'
import { FreeResponseContract } from 'common/contract'
import { ContractComment } from 'common/comment'
import React, { useEffect, useRef, useState } from 'react'
import { sum } from 'lodash'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { useUser } from 'web/hooks/use-user'
import { useEvent } from 'web/hooks/use-event'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { UserLink } from 'web/components/user-link'

export function CommentsAnswer(props: { answer: Answer; contract: Contract }) {
  const { answer, contract } = props
  const { username, avatarUrl, name, text } = answer
  const answerElementId = `answer-${answer.id}`
  const [replyTo, setReplyTo] = useState<ReplyTo>()
  const user = useUser()
  const router = useRouter()
  const answerElementId = `answer-${answer.id}`
  const highlighted = router.asPath.endsWith(`#${answerElementId}`)
  const answerRef = useRef<HTMLDivElement>(null)

  const onSubmitComment = useEvent(() => setReplyTo(undefined))
  const onReplyClick = useEvent((comment: ContractComment) => {
    setReplyTo({ id: comment.id, username: comment.userUsername })
  })

  useEffect(() => {
    if (highlighted && answerRef.current != null) {
      answerRef.current.scrollIntoView(true)
    }
  }, [highlighted])

  return (
    <Row className="bg-greyscale-2 w-fit gap-1 rounded-t-xl rounded-bl-xl px-2 py-2">
      <div className="ml-2">
        <Avatar username={username} avatarUrl={avatarUrl} size="xxs" />
      </div>
      <Col>
        <Row className="gap-1">
          <div className="text-greyscale-6 text-xs">
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
                onClick={() =>
                  setReplyTo({ id: answer.id, username: answer.username })
                }
              >
                Reply
              </button>
            </div>
          </Col>
          <div className="justify-initial hidden sm:block">
            <button
              className="text-xs font-bold text-gray-500 hover:underline"
              onClick={() =>
                setReplyTo({ id: answer.id, username: answer.username })
              }
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
            myTip={user ? tips[comment.id]?.[user.id] : undefined}
            totalTip={sum(Object.values(tips[comment.id] ?? {}))}
            showTip={true}
            onReplyClick={onReplyClick}
          />
        ))}
      </Col>
      {replyTo && (
        <div className="relative ml-7">
          <span
            className="absolute -left-1 -ml-[1px] mt-[1.25rem] h-2 w-0.5 rotate-90 bg-gray-200"
            aria-hidden="true"
          />
          <ContractCommentInput
            contract={contract}
            parentAnswerOutcome={answer.number.toString()}
            replyTo={replyTo}
            onSubmitComment={onSubmitComment}
          />
        </div>
      )}
    </Col>
  )
}
