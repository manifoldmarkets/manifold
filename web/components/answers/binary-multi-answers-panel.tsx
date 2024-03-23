import { Answer } from 'common/answer'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { Button, SizeType } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'
import { useState } from 'react'
import { formatPercent } from 'common/util/format'
import { track } from 'web/lib/service/analytics'
import { Answer as AnswerComponent } from './answers-panel'
import { BuyPanelBody } from 'web/components/bet/bet-panel'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { VERSUS_COLORS } from '../charts/contract/choice'

export function BinaryMultiAnswersPanel(props: {
  contract: CPMMMultiContract
  answers: Answer[]
  feedItem?: FeedTimelineItem
}) {
  const { feedItem, contract, answers } = props

  const [colorLeft, colorRight] = answers.map(
    (a, i) => a.color ?? VERSUS_COLORS[i]
  )
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  if (contract.isResolved) {
    return (
      <>
        {answers.map((answer, i) => (
          <AnswerComponent
            shouldShowLimitOrderChart={false}
            key={answer.id}
            user={null}
            answer={answer}
            contract={contract as MultiContract}
            color={i === 0 ? colorLeft : colorRight}
            feedItem={feedItem}
          />
        ))}
      </>
    )
  }

  return (
    <>
      {outcome === undefined ? (
        <div className="mx-[2px] mt-1 flex flex-col justify-between gap-2 sm:flex-row">
          {answers.map((answer, i) => (
            <BetButton
              outcome={i === 0 ? 'YES' : 'NO'}
              setOutcome={setOutcome}
              key={answer.id}
              answer={answer}
              color={i === 0 ? colorLeft : colorRight}
            />
          ))}
        </div>
      ) : (
        <BinaryMultiChoiceBetPanel
          answer={outcome === 'YES' ? answers[0] : answers[1]}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
        />
      )}
    </>
  )
}

const BetButton = (props: {
  answer: Answer
  outcome: 'YES' | 'NO'
  setOutcome: (outcome: 'YES' | 'NO') => void
  color?: string
  size?: SizeType
}) => {
  const { answer, size, outcome, setOutcome, color } = props

  return (
    <>
      <Button
        size={size ?? 'xl'}
        color="none"
        style={{ backgroundColor: color }}
        className={'flex flex-1 items-center justify-between gap-1 text-white'}
        onClick={() => {
          track('bet intent', { location: 'answer panel' })
          setOutcome(outcome)
        }}
      >
        <span className="line-clamp-1 text-left sm:line-clamp-2">
          {answer.text}
        </span>
        <span className={'text-xl'}>{formatPercent(answer.prob)}</span>
      </Button>
    </>
  )
}

function BinaryMultiChoiceBetPanel(props: {
  answer: Answer
  contract: CPMMMultiContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | undefined
}) {
  const { answer, contract, closePanel, outcome } = props

  return (
    <BuyPanelBody
      contract={contract}
      multiProps={{
        answers: contract.answers,
        answerToBuy: contract.answers[0],
        answerText: answer.text,
      }}
      outcome={outcome}
      onBuySuccess={() => setTimeout(closePanel, 500)}
      onClose={closePanel}
      location={'contract page answer'}
      panelClassName="!bg-canvas-50 gap-2"
    >
      <Row className="justify-between">
        <span className={'text-2xl'}>{answer.text}</span>
      </Row>
    </BuyPanelBody>
  )
}
