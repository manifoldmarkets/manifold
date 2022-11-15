import { Answer } from 'common/answer'
import {
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
} from 'common/contract'
import React, { useEffect, useRef, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { UserLink } from 'web/components/widgets/user-link'
import { FeedCommentThread } from './feed-comments'
import { AnswerCommentInput } from '../comments/comment-input'
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
  const { username, name, text } = answer
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
      <div
        className="w-2"
        style={{
          background: color ? color : '#B1B1C7',
        }}
      />
      <Col className="w-fit bg-gray-100 py-1 pl-2 pr-2">
        <Row className="gap-2">
          <div className="text-xs text-gray-400">
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
  const answersArray = useChartAnswers(contract).map((answer) => answer.text)
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
            <Row className="relative">
              <div className="absolute -bottom-1 left-1.5 z-20">
                <Curve size={32} strokeWidth={1} color="#D8D8EB" />
              </div>
              <div className="ml-[38px]">
                <CommentsAnswer
                  answer={answer}
                  contract={contract}
                  color={color}
                />
              </div>
            </Row>
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
          </>
        )
      })}
    </>
  )
}
