import { Answer, DpmAnswer } from 'common/answer'
import {
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
} from 'common/contract'
import { useEffect, useRef, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { useRouter } from 'next/router'
import { UserLink } from 'web/components/widgets/user-link'
import { getAnswerColor } from '../answers/answers-panel'
import Curve from 'web/lib/icons/comment-curve.svg'
import { useChartAnswers } from '../charts/contract/choice'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { useUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { XCircleIcon } from '@heroicons/react/solid'

function CommentsAnswer(props: {
  answer: Answer | DpmAnswer
  contract: Contract
  color: string
}) {
  const { answer, contract, color } = props
  const { text } = answer
  const answerElementId = `answer-${answer.id}`
  const user = useUserByIdOrAnswer(answer)

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
      scrollIntoViewCentered(answerRef.current)
    }
  }, [highlighted])

  return (
    <Row>
      <div className="w-2 dark:brightness-75" style={{ background: color }} />
      <Col className="bg-ink-100 w-fit py-1 pl-2 pr-2">
        <Row className="gap-2">
          <div className="text-ink-400 text-xs">
            {user && (
              <>
                <UserLink username={user.username} name={user.name} /> answered
              </>
            )}
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

export function CommentOnAnswerRow(props: {
  answer: Answer | DpmAnswer
  contract: FreeResponseContract | MultipleChoiceContract
  clear?: () => void
}) {
  const { answer, contract, clear } = props

  const answersArray = useChartAnswers(contract).map((answer) => answer.text)
  const color = getAnswerColor(answer, answersArray)

  return (
    <Row className="items-end pl-2">
      <Curve className="text-ink-100 h-8 w-8 rotate-90" />
      <div className="relative pb-1">
        <CommentsAnswer answer={answer} contract={contract} color={color} />
        {clear && (
          <button
            onClick={clear}
            className="text-ink-500 hover:text-ink-600 bg-canvas-0 absolute -right-1.5 -top-1.5 rounded-full"
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </Row>
  )
}
