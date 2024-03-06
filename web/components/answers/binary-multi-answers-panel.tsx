import clsx from 'clsx'
import { Answer } from 'common/answer'
import {
  CPMMMultiContract,
  getMainBinaryMCAnswer,
  MultiContract,
} from 'common/contract'
import { Button, ColorType, SizeType } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../layout/col'

import { useState } from 'react'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { User } from 'common/user'
import { formatPercent } from 'common/util/format'
import { track } from 'web/lib/service/analytics'
import { MultiSeller } from 'web/components/answers/answer-components'
import { useUserContractBets } from 'web/hooks/use-user-bets'
import { groupBy, sumBy } from 'lodash'
import { floatingEqual } from 'common/util/math'
import { Answer as AnswerComponent } from './answers-panel'
import { BuyPanel } from 'web/components/bet/bet-panel'

export function BinaryMultiAnswersPanel(props: {
  contract: CPMMMultiContract
  answers: Answer[]
  size?: SizeType
}) {
  const { contract, answers, size } = props
  if (contract.isResolved) {
    return (
      <>
        {answers.map((answer) => (
          <AnswerComponent
            shouldShowLimitOrderChart={false}
            key={answer.id}
            user={null}
            answer={answer}
            contract={contract as MultiContract}
            color={
              answer.id === getMainBinaryMCAnswer(contract)!.id
                ? '#4e46dc'
                : '#e9a23b'
            }
          />
        ))}
      </>
    )
  }
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
            color={answer.id === mainAnswer.id ? 'indigo' : 'amber'}
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
            color={answer.id === mainAnswer.id ? 'indigo' : 'amber'}
          />
        ))}
      </Col>
    </>
  )
}

const BetButton = (props: {
  answer: Answer
  betOnAnswer: Answer
  outcome: 'YES' | 'NO' | undefined
  contract: CPMMMultiContract
  color?: ColorType
  size?: SizeType
}) => {
  const { answer, size, contract, betOnAnswer, color } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  const user = useUser()
  // This accommodates for bets on the non-main answer, perhaps made through the api
  const userBets = useUserContractBets(user?.id, contract.id)
  const userBetsByAnswer = groupBy(userBets, (bet) => bet.answerId)
  const sharesSum = sumBy(userBetsByAnswer[answer.id], (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const showSell = answer.id !== betOnAnswer.id && !floatingEqual(sharesSum, 0)
  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? props.outcome : undefined)}
        className={MODAL_CLASS}
      >
        <BinaryMultiChoiceBetPanel
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
      {showSell && user && (
        <Row className={'justify-end px-2'}>
          <MultiSeller
            answer={answer}
            contract={contract}
            userBets={userBetsByAnswer[answer.id]}
            user={user}
          />
        </Row>
      )}
    </>
  )
}

function BinaryMultiChoiceBetPanel(props: {
  answer: Answer
  betOnAnswer: Answer
  contract: CPMMMultiContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | undefined
  me: User | null | undefined
}) {
  const { answer, betOnAnswer, contract, closePanel, outcome, me } = props
  return (
    <Col className="gap-2">
      <Row className="justify-between">
        <span
          className={clsx(
            'text-2xl',
            betOnAnswer.id === answer.id ? 'text-indigo-500' : 'text-amber-600'
          )}
        >
          {answer.text}
        </span>
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
        onCancel={closePanel}
      />
    </Col>
  )
}
