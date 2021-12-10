import React, { useState } from 'react'
import { Contract } from '../lib/firebase/contracts'
import { Button } from './button'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { YesNoSelector } from './yes-no-selector'

export function BetPanel(props: { contract: Contract }) {
  const { contract } = props

  const [betChoice, setBetChoice] = useState<'yes' | 'no'>('yes')
  const [shares, setShares] = useState(0)

  return (
    <Col>
      <Spacer h={12} />

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
        {shares * (betChoice === 'yes' ? 57 : 43)} points
      </div>

      <Spacer h={6} />

      {shares !== 0 && (
        <Button color={shares ? 'green' : 'deemphasized'}>Place bet</Button>
      )}
    </Col>
  )
}
