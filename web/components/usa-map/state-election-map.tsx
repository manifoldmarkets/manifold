import { zip } from 'lodash'
import Router from 'next/router'
import { useEffect, useState } from 'react'

import { getProbability } from 'common/calculate'
import { CPMMBinaryContract } from 'common/contract'
import { Customize, USAMap } from './usa-map'
import { listenForContract } from 'web/lib/firebase/contracts'
import { interpolateColor } from 'common/util/color'

export interface StateElectionMarket {
  creatorUsername: string
  slug: string
  isWinRepublican: boolean
  state: string
}

export function StateElectionMap(props: {
  markets: StateElectionMarket[]
  contracts: CPMMBinaryContract[]
}) {
  const { markets } = props
  const [contracts, setContracts] = useState(props.contracts)
  useUpdateContracts(contracts, setContracts)

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
      clickHandler: () =>
        Router.push(`/${market.creatorUsername}/${market.slug}`),
    },
  ])

  const config = Object.fromEntries(stateInfo) as Customize

  return <USAMap customize={config} />
}

const probToColor = (prob: number, isWinRepublican: boolean) => {
  const p = isWinRepublican ? prob : 1 - prob
  const color = p > 0.5 ? '#e4534b' : '#5f6eb0'
  return interpolateColor('#ebe4ec', color, Math.abs(p - 0.5) * 2)
}

const useUpdateContracts = (
  contracts: CPMMBinaryContract[],
  setContracts: (newContracts: CPMMBinaryContract[]) => void
) => {
  useEffect(() => {
    if (contracts.some((c) => c === undefined)) return

    // listen to contract updates
    const unsubs = contracts
      .filter((c) => !!c)
      .map((c, i) =>
        listenForContract(
          c.id,
          (newC) =>
            newC &&
            setContracts(setAt(contracts, i, newC as CPMMBinaryContract))
        )
      )
    return () => unsubs.forEach((u) => u())
  }, [contracts, setContracts])

  return contracts
}

function setAt<T>(arr: T[], i: number, val: T) {
  const newArr = [...arr]
  newArr[i] = val
  return newArr
}
