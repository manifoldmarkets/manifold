import React, { useState } from 'react'
import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'

export function BetPanel(props: { contract: Contract; className?: string }) {
  const { contract, className } = props

  const [betChoice, setBetChoice] = useState<'YES' | 'NO'>('YES')
  const [shares, setShares] = useState(0)

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

      <div className="p-2 font-medium">Shares</div>
      <div className="p-2">
        <input
          className="input input-bordered input-md"
          style={{ maxWidth: 80 }}
          type="text"
          value={shares}
          onChange={(e) => setShares(parseInt(e.target.value) || 0)}
          onFocus={(e) => e.target.select()}
        />
      </div>

      <Spacer h={4} />

      <div className="p-2 font-medium">Price</div>
      <div className="px-2">
        {shares * (betChoice === 'YES' ? 57 : 43)} points
      </div>

      <Spacer h={6} />

      {shares !== 0 && (
        <button className="btn btn-primary">Place bet</button>
      )}
    </Col>
  )
}
