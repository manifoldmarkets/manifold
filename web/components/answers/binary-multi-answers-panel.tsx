import clsx from 'clsx'
import { type Answer } from 'common/answer'
import { CPMMMultiContract, getMainBinaryMCAnswer } from 'common/contract'
import { Button, ColorType, SizeType } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../layout/col'

import { useState } from 'react'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { User } from 'common/user'
import { formatPercent } from 'common/util/format'
import { track } from 'web/lib/service/analytics'
import { Subtitle } from 'web/components/widgets/subtitle'
import { BuyPanel } from 'web/components/bet/bet-panel'

export function BinaryMultiAnswersPanel(props: {
  contract: CPMMMultiContract
  answers: Answer[]
  size?: SizeType
}) {
  const { contract, answers, size } = props
  const mainAnswer = getMainBinaryMCAnswer(contract)!
  return (
    <>
      <Row className="mx-[2px] mt-1 hidden justify-between gap-2 sm:inline-flex">
        {answers.map((answer) => (
          <BetButton
            size={size}
            betOnAnswer={mainAnswer}
            outcome={answer.id === mainAnswer.id ? 'YES' : 'NO'}
            key={answer.id}
            contract={contract}
            answer={answer}
            color={answer.id === mainAnswer.id ? 'green' : 'red'}
          />
        ))}
      </Row>
      <Col className="mx-[2px] mt-1 gap-2 sm:hidden">
        {answers.map((answer) => (
          <BetButton
            size={size}
            betOnAnswer={mainAnswer}
            outcome={answer.id === mainAnswer.id ? 'YES' : 'NO'}
            key={answer.id}
            contract={contract}
            answer={answer}
            color={answer.id === mainAnswer.id ? 'green' : 'red'}
          />
        ))}
      </Col>
    </>
  )
}

const BetButton = (props: {
  answer: Answer
  betOnAnswer: Answer
  outcome: 'YES' | 'NO' | 'LIMIT' | undefined
  contract: CPMMMultiContract
  color?: ColorType
  size?: SizeType
}) => {
  const { answer, size, contract, betOnAnswer, color } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | 'LIMIT' | undefined>(
    undefined
  )

  const user = useUser()

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? props.outcome : undefined)}
        className={MODAL_CLASS}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          betOnAnswer={betOnAnswer}
          contract={contract}
          outcome={props.outcome}
          closePanel={() => setOutcome(undefined)}
          me={user}
        />
      </Modal>

      <Button
        size={size ?? 'xl'}
        color={color}
        className={clsx('flex-1')}
        onClick={(e) => {
          e.stopPropagation()
          track('bet intent', { location: 'answer panel' })
          setOutcome(props.outcome)
        }}
      >
        <Row className={'w-full items-center justify-between '}>
          <span
            className={clsx(
              size === 'xs' ? 'line-clamp-1' : 'line-clamp-2',
              'text-left'
            )}
          >
            {answer.text}
          </span>
          <span className={'text-xl'}>{formatPercent(answer.prob)}</span>
        </Row>
      </Button>
    </>
  )
}

function AnswerCpmmBetPanel(props: {
  answer: Answer
  betOnAnswer: Answer
  contract: CPMMMultiContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | 'LIMIT' | undefined
  me: User | null | undefined
}) {
  const { answer, betOnAnswer, contract, closePanel, outcome, me } = props
  return (
    <Col className="gap-2">
      <Row className="justify-between">
        <Subtitle className="!mt-0">{answer.text}</Subtitle>
        <div className="text-xl">{formatPercent(answer.prob)}</div>
      </Row>
      <BuyPanel
        contract={contract}
        multiProps={{
          answers: contract.answers,
          answerToBuy: betOnAnswer as Answer,
          answerText: answer.text,
        }}
        user={me}
        initialOutcome={outcome}
        singularView={outcome}
        onBuySuccess={() => setTimeout(closePanel, 500)}
        location={'contract page answer'}
        inModal={true}
      />
    </Col>
  )
}
