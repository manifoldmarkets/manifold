'use client'
import { zip } from 'lodash'
import { useEffect, useState, useMemo } from 'react'

import { getProbability } from 'common/calculate'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { Customize, USAMap } from './usa-map'
import { listenForContract } from 'web/lib/firebase/contracts'
import { getContractFromSlug } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { Col } from 'web/components/layout/col'
import { FeedContractCard } from '../contract/contract-card'

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

  const stateContractMap: Customize = useMemo(() => {
    const map: Record<
      string,
      { fill: string; clickHandler: () => void; selected: boolean | undefined }
    > = {}
    markets.forEach((market) => {
      const contract = contracts.find((c) => c.slug === market.slug) as
        | CPMMBinaryContract
        | undefined
      map[market.state] = {
        fill: probToColor(
          contract ? getProbability(contract) : 0.5,
          market.isWinRepublican
        ),
        clickHandler: () => {
          if (targetContract && contract?.id === targetContract.id) {
            setTargetContract(undefined)
          } else {
            setTargetContract(contract)
          }
        },
        selected: targetContract?.id === contract?.id,
      }
    })
    return map
  }, [markets, contracts, targetContract])

  return (
    <Col>
      <USAMap customize={stateContractMap} />
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
