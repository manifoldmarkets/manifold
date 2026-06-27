import { useEffect, useState } from 'react'
import { sortBy } from 'lodash'

import { Contract, MarketContract } from 'common/contract'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Button } from 'web/components/buttons/button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Col } from '../layout/col'

// Onboarding step: drop the new user onto one curated, live market with the bet
// panel pre-opened, so onboarding ends in a real first prediction. Placing a bet
// (or skipping) advances the welcome flow. Never blocks: if no market is found we
// silently move on.
export function FirstBetPage(props: {
  onNext: () => void
  goBack?: () => void
}) {
  const { onNext } = props
  // undefined = still loading; null = no market found (skip the step)
  const [contract, setContract] = useState<Contract | null | undefined>(
    undefined
  )

  useEffect(() => {
    track('first-bet onboarding: shown')
    api('get-onboarding-market', {})
      .then((res) => setContract(res.market ?? null))
      .catch(() => setContract(null))
  }, [])

  // If we couldn't find a suitable market, don't trap the user here.
  useEffect(() => {
    if (contract === null) onNext()
  }, [contract])

  if (contract === undefined) {
    return (
      <Col className="h-48 items-center justify-center">
        <LoadingIndicator />
      </Col>
    )
  }
  if (contract === null) return <></>

  const isMulti = contract.outcomeType === 'MULTIPLE_CHOICE'
  const answers = 'answers' in contract ? contract.answers : []
  const answerToBuy = answers.length
    ? sortBy(
        answers.filter((a) => a.resolutionTime == null),
        (a) => -a.prob
      )[0]
    : undefined

  return (
    <Col className="gap-3">
      <div className="text-primary-700 text-2xl">
        Make your first prediction
      </div>
      <div className="text-ink-700">
        You've got mana to play with — back your opinion on a real market.
        Placing a prediction is how Manifold works.
      </div>
      <Col className="bg-canvas-50 gap-2 rounded-lg p-3">
        <div className="font-semibold">{contract.question}</div>
        <BuyPanel
          contract={contract as MarketContract}
          inModal
          location="onboarding first bet"
          initialOutcome={isMulti ? undefined : 'YES'}
          multiProps={
            isMulti && answerToBuy ? { answers, answerToBuy } : undefined
          }
          onBuySuccess={() => {
            track('first-bet onboarding: bet placed', {
              contractId: contract.id,
            })
            onNext()
          }}
        />
      </Col>
      <Button
        color="gray-white"
        onClick={() => {
          track('first-bet onboarding: skipped')
          onNext()
        }}
      >
        Skip for now
      </Button>
    </Col>
  )
}
