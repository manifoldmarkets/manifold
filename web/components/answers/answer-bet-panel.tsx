import { Answer } from 'common/answer'
import { ComponentProps } from 'react'
import { getAnswerProbability } from 'common/calculate'
import { showsSideProbability, versusSideProb } from 'common/versus'
import { CPMMMultiContract, CPMMNumericContract } from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { formatPercent } from 'common/util/format'
import { BuyPanel } from '../bet/bet-panel'

export function AnswerCpmmBetPanel(props: {
  answer: Answer
  contract: CPMMMultiContract | CPMMNumericContract
  closePanel: () => void
  outcome: 'YES' | 'NO' | undefined
  alwaysShowOutcomeSwitcher?: boolean
  pseudonym?: ComponentProps<typeof BuyPanel>['pseudonym']
  feedReason?: string
}) {
  const {
    answer,
    contract,
    closePanel,
    outcome,
    feedReason,
    alwaysShowOutcomeSwitcher = true,
    pseudonym = {
      YES: { pseudonymName: 'YES', pseudonymColor: 'green' },
      NO: { pseudonymName: 'NO', pseudonymColor: 'red' },
    },
  } = props

  return (
    <Col className="bg-canvas-0 rounded-2xl">
      <BuyPanel
        contract={contract}
        multiProps={{
          answers: contract.answers,
          answerToBuy: answer,
        }}
        initialOutcome={outcome}
        // singularView={outcome}
        onBuySuccess={() => setTimeout(closePanel, 500)}
        location={'contract page answer'}
        feedReason={feedReason}
        inModal={true}
        alwaysShowOutcomeSwitcher={alwaysShowOutcomeSwitcher}
        pseudonym={pseudonym}
      >
        {(selectedOutcome) => {
          const answerProb = getAnswerProbability(contract, answer.id)
          // NO on an answer is "any other answer", so it shows the answer's
          // own chance unless NO is a named opponent.
          const sideProb = showsSideProbability(contract, pseudonym)
          return (
            <Col className="text-ink-900 mb-4 gap-2">
              <h1 className="text-lg">{answer.text}</h1>
              <Row className="items-baseline justify-between gap-2">
                <span className="text-ink-500 text-sm">
                  {sideProb
                    ? `${
                        pseudonym[selectedOutcome ?? 'YES'].pseudonymName
                      } probability`
                    : 'Probability'}
                </span>
                <span className="text-lg font-semibold">
                  {formatPercent(
                    sideProb
                      ? versusSideProb(selectedOutcome ?? 'YES', answerProb)
                      : answerProb
                  )}
                </span>
              </Row>
            </Col>
          )
        }}
      </BuyPanel>
    </Col>
  )
}
