import { Answer } from 'common/answer'
import { Contract } from 'common/contract'
import React, { useEffect, useRef } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { UserLink } from 'web/components/user-link'

export function CommentsAnswer(props: { answer: Answer; contract: Contract }) {
  const { answer, contract } = props
  const { username, avatarUrl, name, text } = answer
  const answerElementId = `answer-${answer.id}`
  const router = useRouter()
  const highlighted = router.asPath.endsWith(`#${answerElementId}`)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted && answerRef.current != null) {
      answerRef.current.scrollIntoView(true)
    }
  }, [highlighted])

  return (
    <Col className="bg-greyscale-2 w-fit gap-1 rounded-t-xl rounded-bl-xl py-2 px-4">
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
  )
}
