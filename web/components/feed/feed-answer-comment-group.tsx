import { Answer } from 'common/answer'
import { FreeResponseContract } from 'common/contract'
import { ContractComment } from 'common/comment'
import React, { useEffect, useRef, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { Linkify } from 'web/components/linkify'
import clsx from 'clsx'
import {
  ContractCommentInput,
  FeedComment,
  ReplyTo,
} from 'web/components/feed/feed-comments'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { UserLink } from 'web/components/user-link'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon'
import { ReplyToggle } from '../comments/comments'

export function FeedAnswerCommentGroup(props: {
  contract: FreeResponseContract
  answer: Answer
  answerComments: ContractComment[]
  tips: CommentTipMap
}) {
  const { answer, contract, answerComments, tips } = props
  const { username, avatarUrl, name, text } = answer

  const [seeReplies, setSeeReplies] = useState(false)

  const [replyTo, setReplyTo] = useState<ReplyTo>()
  const router = useRouter()
  const answerElementId = `answer-${answer.id}`
  const highlighted = router.asPath.endsWith(`#${answerElementId}`)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted && answerRef.current != null) {
      answerRef.current.scrollIntoView(true)
    }
  }, [highlighted])
  return (
    <Col className="relative flex-1 items-stretch gap-3">
      <Row
        className={clsx(
          'gap- space-x-3 pt-4 transition-all duration-1000',
          highlighted ? `-m-2 my-3 rounded bg-indigo-500/[0.2] p-2` : ''
        )}
        ref={answerRef}
        id={answerElementId}
      >
        <Col>
          <Avatar username={username} avatarUrl={avatarUrl} size="xs" />
          {seeReplies && (
            <span
              className="mx-auto h-full w-0.5 bg-gray-200"
              aria-hidden="true"
            />
          )}
        </Col>
        <Col className="min-w-0 flex-1">
          <div className="text-greyscale-6 text-xs">
            <UserLink username={username} name={name} /> answered
            <CopyLinkDateTimeComponent
              prefix={contract.creatorUsername}
              slug={contract.slug}
              createdTime={answer.createdTime}
              elementId={answerElementId}
            />
          </div>
          <Row className="align-items justify-between gap-2 sm:flex-row">
            <span className="text-md whitespace-pre-line">
              <Linkify text={text} />
            </span>
            <div>
              <button
                className="text-xs font-bold text-gray-500 hover:underline"
                onClick={() =>
                  setReplyTo({ id: answer.id, username: answer.username })
                }
              >
                Reply
              </button>
            </div>
          </Row>
          <ReplyToggle
            seeReplies={seeReplies}
            numComments={answerComments.length}
            onClick={() => setSeeReplies(!seeReplies)}
          />
        </Col>
      </Row>
      {seeReplies && (
        <Col className="gap-3 pl-1">
          {answerComments.map((comment) => (
            <FeedComment
              key={comment.id}
              indent={true}
              contract={contract}
              comment={comment}
              tips={tips[comment.id] ?? {}}
              onReplyClick={() =>
                setReplyTo({ id: comment.id, username: comment.userUsername })
              }
            />
          ))}
        </Col>
      )}
      {replyTo && (
        <div className="relative ml-7">
          <span
            className="bg-greyscale-2 absolute -left-1 -ml-[1px] mt-[1.25rem] h-2 w-0.5 rotate-90"
            aria-hidden="true"
          />
          <ContractCommentInput
            contract={contract}
            parentAnswerOutcome={answer.number.toString()}
            replyTo={replyTo}
            onSubmitComment={() => setReplyTo(undefined)}
          />
        </div>
      )}
    </Col>
  )
}
