import clsx from 'clsx'
import React, { useState } from 'react'

import { Col } from './layout/col'
import { User } from 'web/lib/firebase/users'
import { YesNoCancelSelector } from './yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './confirmation-button'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { ProbabilitySelector } from './probability-selector'
import { getProbability } from 'common/calculate'
import { BinaryContract, resolution } from 'common/contract'
import { BETTOR, BETTORS, PAST_BETS } from 'common/user'

export function ResolutionPanel(props: {
  isAdmin: boolean
  isCreator: boolean
  creator: User
  contract: BinaryContract
  className?: string
}) {
  const { contract, className, isAdmin, isCreator } = props

  // const earnedFees =
  //   contract.mechanism === 'dpm-2'
  //     ? `${DPM_CREATOR_FEE * 100}% of trader profits`
  //     : `${formatMoney(contract.collectedFees.creatorFee)} in fees`

  const [outcome, setOutcome] = useState<resolution | undefined>()

  const [prob, setProb] = useState(getProbability(contract) * 100)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    if (!outcome) return

    setIsSubmitting(true)

    try {
      const result = await resolveMarket({
        outcome,
        contractId: contract.id,
        probabilityInt: prob,
      })
      console.log('resolved', outcome, 'result:', result)
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.toString())
      } else {
        console.error(e)
        setError('Error resolving market')
      }
    }

    setIsSubmitting(false)
  }

  return (
    <Col className={clsx('relative rounded-md bg-white px-8 py-6', className)}>
      {isAdmin && !isCreator && (
        <span className="absolute right-4 top-4 rounded bg-red-200 p-1 text-xs text-red-600">
          ADMIN
        </span>
      )}
      <div className="mb-6 whitespace-nowrap text-2xl">Resolve market</div>
      <div className="mb-3 text-sm text-gray-500">Outcome</div>
      <YesNoCancelSelector
        className="mx-auto my-2"
        selected={outcome}
        onSelect={setOutcome}
        btnClassName={isSubmitting ? 'btn-disabled' : ''}
      />
      <Spacer h={4} />
      <div>
        {outcome === 'YES' ? (
          <>
            Winnings will be paid out to {BETTORS} who bought YES.
            {/* <br />
            <br />
            You will earn {earnedFees}. */}
          </>
        ) : outcome === 'NO' ? (
          <>
            Winnings will be paid out to {BETTORS} who bought NO.
            {/* <br />
            <br />
            You will earn {earnedFees}. */}
          </>
        ) : outcome === 'CANCEL' ? (
          <>
            All {PAST_BETS} will be returned. Unique {BETTOR} bonuses will be
            withdrawn from your account
          </>
        ) : outcome === 'MKT' ? (
          <Col className="gap-6">
            <div>
              {PAST_BETS} will be paid out at the probability you specify:
            </div>
            <ProbabilitySelector
              probabilityInt={Math.round(prob)}
              setProbabilityInt={setProb}
            />
            {/* You will earn {earnedFees}. */}
          </Col>
        ) : (
          <>Resolving this market will immediately pay out {BETTORS}.</>
        )}
      </div>
      <Spacer h={4} />
      {!!error && <div className="text-red-500">{error}</div>}
      <ResolveConfirmationButton
        color={
          outcome === 'YES'
            ? 'green'
            : outcome === 'NO'
            ? 'red'
            : outcome === 'CANCEL'
            ? 'yellow'
            : outcome === 'MKT'
            ? 'blue'
            : 'indigo'
        }
        disabled={!outcome}
        onResolve={resolve}
        isSubmitting={isSubmitting}
      />
    </Col>
  )
}
