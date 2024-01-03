'use client'
import { useMemo, useState } from 'react'

import { Contract, CPMMBinaryContract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { FeedContractCard } from '../contract/contract-card'
import { presidency2024 } from './election-contract-data'
import { Customize, USAMap } from './usa-map'

export interface StateElectionMarket {
  slug: string
  state: string
}

export type ElectionMode = 'presidency' | 'senate' | 'house'
export function StateElectionMap(props: { mode: ElectionMode }) {
  const { mode } = props
  let markets: StateElectionMarket[] = []

  if (mode === 'presidency') {
    markets = presidency2024
  }

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
        fill: probToColor(contract) ?? '#D6D1D3',
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
    <Col className="gap-3">
      <USAMap customize={stateContractMap} />
      {targetContract && <FeedContractCard contract={targetContract} />}
    </Col>
  )
}

const probToColor = (contract: Contract | undefined) => {
  type Color = { r: number; g: number; b: number }
  function interpolateColor(color1: Color, color2: Color, factor: number) {
    // Linear interpolation between two colors
    const r = Math.round(color1.r + factor * (color2.r - color1.r))
    const g = Math.round(color1.g + factor * (color2.g - color1.g))
    const b = Math.round(color1.b + factor * (color2.b - color1.b))

    // Convert RGB to Hex
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  }
  if (!contract || contract.mechanism !== 'cpmm-multi-1') return undefined
  const answers = contract.answers

  // Base colors
  const DEM_LIGHT = { r: 206, g: 220, b: 239 } // #cedcef
  const REP_LIGHT = { r: 244, g: 218, b: 215 } // #f4dad7
  const DEM_DARK = { r: 86, g: 113, b: 186 } // #5671ba
  const REP_DARK = { r: 194, g: 85, b: 85 } // #c25555

  // Difference threshold
  const THRESHOLD = 0.05

  const probDemocratic = answers.find((a) => a.text == 'Democratic Party')?.prob
  const probRepublican = answers.find((a) => a.text == 'Republican Party')?.prob
  const probOther = answers.find((a) => a.text == 'Other')?.prob

  if (
    probDemocratic === undefined ||
    probRepublican === undefined ||
    probOther === undefined
  )
    return undefined

  // Calculate the difference
  const difference = Math.abs(probDemocratic - probRepublican)

  if (difference < THRESHOLD) {
    // Blend the light colors if difference is less than 5%
    return interpolateColor(
      DEM_LIGHT,
      REP_LIGHT,
      probDemocratic / (probDemocratic + probRepublican)
    )
  } else {
    // Interpolate towards the darker shade based on the dominant side
    if (probDemocratic > probRepublican) {
      return interpolateColor(
        DEM_LIGHT,
        DEM_DARK,
        (difference - THRESHOLD) / (1 - THRESHOLD)
      )
    } else {
      return interpolateColor(
        REP_LIGHT,
        REP_DARK,
        (difference - THRESHOLD) / (1 - THRESHOLD)
      )
    }
  }
}
