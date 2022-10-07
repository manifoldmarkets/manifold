import { Answer } from 'common/answer'
import { Contract, FreeResponseContract } from 'common/contract'
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
import { ReplyIcon } from '@heroicons/react/solid'

export function CommentsAnswer(props: { answer: Answer; contract: Contract }) {
  const { answer, contract } = props
  const { username, avatarUrl, name, text } = answer
  const answerElementId = `answer-${answer.id}`
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
        </Row>
        <div className="text-greyscale-7 text-sm">{text}</div>
      </Col>
    </Row>
  )
}
