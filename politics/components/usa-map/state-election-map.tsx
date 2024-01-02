'use client'
import { zip } from 'lodash'
import { useEffect, useState } from 'react'

import { getProbability } from 'common/calculate'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { Customize, USAMap } from './usa-map'
import { listenForContract } from 'web/lib/firebase/contracts'
import { getContractFromSlug } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { Col } from 'web/components/layout/col'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'

export interface StateElectionMarket {
  creatorUsername: string
  slug: string
  isWinRepublican: boolean
  state: string
}

export function StateElectionMap(props: { markets: StateElectionMarket[] }) {
  const { markets } = props

  const contracts = useContracts(
    markets.map((m) => m.slug),
    'slug'
  )

  const [targetContract, setTargetContract] = useState<Contract | undefined>(
    undefined
  )
  const marketsWithProbs = zip(markets, contracts) as [
    StateElectionMarket,
    Contract
  ][]

  const stateInfo = marketsWithProbs.map(([market, contract]) => [
    market.state,
    {
      fill: probToColor(
        contract ? getProbability(contract as CPMMBinaryContract) : 0.5,
        market.isWinRepublican
      ),
      clickHandler: () => {
        setTargetContract(contract)
      },
    },
  ])

  const config = Object.fromEntries(stateInfo) as Customize

  return (
    <Col>
      <USAMap customize={config} />
      {targetContract && <FeedContractCard contract={targetContract} />}
    </Col>
  )
}

const probToColor = (prob: number, isWinRepublican: boolean) => {
  const p = isWinRepublican ? prob : 1 - prob
  const hue = p > 0.5 ? 350 : 240
  const saturation = 100
  const lightness = 100 - 50 * Math.abs(p - 0.5)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}
