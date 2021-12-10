import React, { useState } from 'react'
import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'

export function BetPanel(props: { contract: Contract; className?: string }) {
  const { contract, className } = props

  const [betChoice, setBetChoice] = useState<'YES' | 'NO'>('YES')
  const [betAmount, setBetAmount] = useState<number | undefined>(undefined)

  function onBetChange(str: string) {
    const amount = parseInt(str)
    setBetAmount(isNaN(amount) ? undefined : amount)
  }

  return (
    <Col className={'bg-gray-600 p-6 rounded ' + className}>
      <div className="p-2 font-medium">Pick outcome</div>
      <YesNoSelector
        className="p-2"
        selected={betChoice}
        onSelect={setBetChoice}
        yesLabel="Yes 57"
        noLabel="No 43"
      />

      <Spacer h={4} />

      <div className="p-2 font-medium">Bet amount</div>
      <Row className="p-2 items-center">
        <input
          className="input input-bordered input-md"
          style={{ maxWidth: 80 }}
          type="text"
          placeholder="0"
          value={betAmount ?? ''}
          onChange={(e) => onBetChange(e.target.value)}
        />
        <div className="ml-3">points</div>
      </Row>

      {!!betAmount && (
        <>
          <Spacer h={4} />

          <div className="p-2 font-medium">Average price</div>
          <div className="px-2">
            {betChoice === 'YES' ? 0.57 : 0.43} points
          </div>

          <Spacer h={2} />

          <div className="p-2 font-medium">Estimated winnings</div>
          <div className="px-2">
            {Math.floor(betAmount / (betChoice === 'YES' ? 0.57 : 0.43))} points
          </div>

          <Spacer h={6} />

          <button className="btn btn-primary">Place bet</button>
        </>
      )}
    </Col>
  )
}
