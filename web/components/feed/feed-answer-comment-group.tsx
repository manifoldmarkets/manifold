import { Answer } from 'common/answer'
import {
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
} from 'common/contract'
import React, { useEffect, useRef, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { UserLink } from 'web/components/user-link'
import { FeedCommentThread } from './feed-comments'
import { AnswerCommentInput } from '../comment-input'
import { ContractComment } from 'common/comment'
import { Dictionary, sortBy } from 'lodash'
import { getAnswerColor } from '../answers/answers-panel'
import Curve from 'web/public/custom-components/curve'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { useChartAnswers } from '../charts/contract/choice'

export function CommentsAnswer(props: {
  answer: Answer
  contract: Contract
  color: string
}) {
  const { answer, contract, color } = props
  const { username, avatarUrl, name, text } = answer
  const answerElementId = `answer-${answer.id}`

  const { isReady, asPath } = useRouter()
  const [highlighted, setHighlighted] = useState(false)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isReady && asPath.endsWith(`#${answerElementId}`)) {
      setHighlighted(true)
    }
  }, [isReady, asPath, answerElementId])

  useEffect(() => {
    if (highlighted && answerRef.current) {
      answerRef.current.scrollIntoView(true)
    }
  }, [highlighted])

  return (
    <Row>
      {/* TODO: known bug, doesn't grab color in time and it is gray */}
      <div
        className="w-2"
        style={{
          background: color ? color : '#B1B1C7',
        }}
      />
      <Col className="w-fit gap-1 bg-gray-100 py-2 pl-2 pr-4">
        <Row className="gap-2">
          <Avatar username={username} avatarUrl={avatarUrl} size="xxs" />
          <div className="text-greyscale-6 text-xs">
            <UserLink username={username} name={name} /> answered
            <CopyLinkDateTimeComponent
              prefix={contract.creatorUsername}
              slug={contract.slug}
              createdTime={answer.createdTime}
              elementId={answerElementId}
            />
          </div>
        </Row>
        <div className="text-sm">{text}</div>
      </Col>
    </Row>
  )
}

export function FreeResponseComments(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  answerResponse: Answer | undefined
  onCancelAnswerResponse?: () => void
  topLevelComments: ContractComment[]
  commentsByParent: Dictionary<[ContractComment, ...ContractComment[]]>
  tips: CommentTipMap
}) {
  const {
    contract,
    answerResponse,
    onCancelAnswerResponse,
    topLevelComments,
    commentsByParent,
    tips,
  } = props
  const answersArray = useChartAnswers(contract)
  return (
    <>
      {answerResponse && (
        <AnswerCommentInput
          contract={contract}
          answerResponse={answerResponse}
          onCancelAnswerResponse={onCancelAnswerResponse}
          answersArray={answersArray}
        />
      )}
      {topLevelComments.map((parent) => {
        if (parent.answerOutcome === undefined) {
          return (
            <FeedCommentThread
              key={parent.id}
              contract={contract}
              parentComment={parent}
              threadComments={sortBy(
                commentsByParent[parent.id] ?? [],
                (c) => c.createdTime
              )}
              tips={tips}
            />
          )
        }
        const answer = contract.answers.find(
          (answer) => answer.id === parent.answerOutcome
        )
        if (answer === undefined) {
          console.error('Could not find answer that matches ID')
          return <></>
        }
        const color = getAnswerColor(answer, answersArray)
        return (
          <>
            <Row className="gap-2">
              <CommentsAnswer
                answer={answer}
                contract={contract}
                color={color}
              />
            </Row>
            <Row>
              <div className="ml-1">
                <Curve size={28} strokeWidth={1} color="#D8D8EB" />
              </div>
              <div className="w-full pt-1">
                <FeedCommentThread
                  key={parent.id}
                  contract={contract}
                  parentComment={parent}
                  threadComments={sortBy(
                    commentsByParent[parent.id] ?? [],
                    (c) => c.createdTime
                  )}
                  tips={tips}
                />
              </div>
            </Row>
          </>
        )
      })}
    </>
  )
}
