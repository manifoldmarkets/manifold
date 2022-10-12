import { Answer } from 'common/answer'
import { Contract } from 'common/contract'
import React, { useEffect, useRef, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { UserLink } from 'web/components/user-link'

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
          background: color ? color : '#B1B1C755',
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
