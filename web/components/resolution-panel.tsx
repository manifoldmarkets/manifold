import clsx from 'clsx'
import React, { useState } from 'react'

import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Title } from './title'
import { User } from '../lib/firebase/users'
import { YesNoCancelSelector } from './yes-no-selector'
import { Spacer } from './layout/spacer'

export function ResolutionPanel(props: {
  creator: User
  contract: Contract
  className?: string
}) {
  const { creator, contract, className } = props

  const [outcome, setOutcome] = useState<'YES' | 'NO' | 'CANCEL' | undefined>()

  const resolveDisabled = false

  function resolve() {}

  return (
    <Col
      className={clsx(
        'bg-gray-200 shadow-xl px-8 py-6 rounded-md w-full md:w-auto',
        className
      )}
    >
      <Title className="mt-0" text="Your market" />

      <div className="pt-2 pb-1 text-sm text-gray-500">Resolve outcome</div>
      <YesNoCancelSelector
        className="p-2"
        selected={outcome}
        onSelect={setOutcome}
      />

      <Spacer h={3} />

      <div className="text-gray-500 text-sm">
        {outcome === 'YES' ? (
          <>
            Winnings will be paid out to Yes bettors. You earn 1% of the No
            bets.
          </>
        ) : outcome === 'NO' ? (
          <>
            Winnings will be paid out to No bettors. You earn 1% of the Yes
            bets.
          </>
        ) : outcome === 'CANCEL' ? (
          <>All bets will be returned with no fees.</>
        ) : (
          <>Resolving this market will immediately pay out bettors.</>
        )}
      </div>

      <Spacer h={3} />

      <button
        className={clsx(
          'btn border-none self-start m-2',
          resolveDisabled
            ? 'btn-disabled'
            : outcome === 'YES'
            ? 'btn-primary'
            : outcome === 'NO'
            ? 'bg-red-400 hover:bg-red-500'
            : outcome === 'CANCEL'
            ? 'bg-yellow-400 hover:bg-yellow-500'
            : 'btn-disabled'
        )}
        onClick={resolveDisabled ? undefined : resolve}
      >
        Resolve
      </button>
    </Col>
  )
}
