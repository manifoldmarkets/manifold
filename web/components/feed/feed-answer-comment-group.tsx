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
import { ReplyTo } from './feed-comments'

export function CommentsAnswer(props: { answer: Answer; contract: Contract }) {
  const { answer, contract } = props
  const { username, avatarUrl, name, text } = answer
  const answerElementId = `answer-${answer.id}`
  const [replyTo, setReplyTo] = useState<ReplyTo>()
  const user = useUser()
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
      <div className="text-sm">{answer.text}</div>
    </Col>
  )
}
