'use client'
import { zip } from 'lodash'
import { useEffect, useState } from 'react'

import { getProbability } from 'common/calculate'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { Customize, USAMap } from './usa-map'
import { listenForContract } from 'web/lib/firebase/contracts'

export interface StateElectionMarket {
  creatorUsername: string
  slug: string
  isWinRepublican: boolean
  state: string
}

export function StateElectionMap(props: { markets: StateElectionMarket[] }) {
  const { markets } = props

  const contracts = useContracts(markets.map((m) => m.slug))
  const probs = contracts.map((c) =>
    c ? getProbability(c as CPMMBinaryContract) : 0.5
  )
  const marketsWithProbs = zip(markets, probs) as [
    StateElectionMarket,
    number
  ][]

  const stateInfo = marketsWithProbs.map(([market, prob]) => [
    market.state,
    {
      fill: probToColor(prob, market.isWinRepublican),
      clickHandler: () => {},
    },
  ])

  const config = Object.fromEntries(stateInfo) as Customize

  return <USAMap customize={config} />
}

const probToColor = (prob: number, isWinRepublican: boolean) => {
  const p = isWinRepublican ? prob : 1 - prob
  const hue = p > 0.5 ? 350 : 240
  const saturation = 100
  const lightness = 100 - 50 * Math.abs(p - 0.5)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

const useContracts = (slugs: string[]) => {
  const [contracts, setContracts] = useState<(Contract | undefined)[]>(
    slugs.map(() => undefined)
  )

  // useEffect(() => {
  //   Promise.all(slugs.map((slug) => getContractFromSlug(slug))).then(
  //     (contracts) => setContracts(contracts)
  //   )
  // }, [slugs])

  useEffect(() => {
    if (contracts.some((c) => c === undefined)) return

    // listen to contract updates
    const unsubs = (contracts as Contract[]).map((c, i) =>
      listenForContract(
        c.id,
        (newC) => newC && setContracts(setAt(contracts, i, newC))
      )
    )
    return () => unsubs.forEach((u) => u())
  }, [contracts])

  return contracts
}

function setAt<T>(arr: T[], i: number, val: T) {
  const newArr = [...arr]
  newArr[i] = val
  return newArr
}
