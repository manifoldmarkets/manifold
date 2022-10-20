import { zip } from 'lodash'
import Router from 'next/router'
import { useEffect, useState } from 'react'

import { getProbability } from 'common/calculate'
import { CPMMBinaryContract } from 'common/contract'
import { Customize, USAMap } from './usa-map'
import { listenForContract } from 'web/lib/firebase/contracts'
import { interpolateColor } from 'common/util/color'
import { track } from 'web/lib/service/analytics'
import { ContractCard } from '../contract/contract-card'
import { Row } from '../layout/row'
import { useIsMobile } from 'web/hooks/use-is-mobile'

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
  const [coordinate, setCoordinate] = useState({ top: 0, left: 0 })
  const [hoveredContract, setHoveredContract] =
    useState<CPMMBinaryContract | null>(null)
  useUpdateContracts(contracts, setContracts)

  const probs = contracts.map((c) =>
    c ? getProbability(c as CPMMBinaryContract) : 0.5
  )
  const marketsWithProbs = zip(markets, probs) as [
    StateElectionMarket,
    number
  ][]

  const isMobile = useIsMobile()

  const stateInfo = marketsWithProbs.map(([market, prob]) => [
    market.state,
    {
      fill: probToColor(prob, market.isWinRepublican),
      clickHandler: () => {
        if (isMobile) setHoveredContract(contracts[markets.indexOf(market)])
        else Router.push(`/${market.creatorUsername}/${market.slug}`)

        track('state election map click', {
          state: market.state,
          slug: market.slug,
        })
      },
      mouseEnterHandler: (e: React.MouseEvent<SVGPathElement, MouseEvent>) => {
        setHoveredContract(contracts[markets.indexOf(market)])
        setCoordinate({ top: e.clientY, left: e.clientX })
      },
      mouseLeaveHandler: () => {
        if (isMobile) return
        setHoveredContract(null)
      },
    },
  ])

  const config = Object.fromEntries(stateInfo) as Customize

  return (
    <div className="w-full">
      <div
        id="tooltip"
        className="pointer-events-none fixed z-[999] ml-auto hidden rounded-[6px] p-[10px] sm:inline"
        style={{ top: `${coordinate.top}px`, left: `${coordinate.left}px` }}
      >
        {hoveredContract && (
          <ContractCard
            noLinkAvatar
            newTab
            contract={hoveredContract}
            key={hoveredContract.id}
            hideQuickBet
            className="w-[300px]"
          />
        )}
      </div>

      <USAMap customize={config} />

      <Row className="-mt-8 items-center justify-center sm:hidden">
        {hoveredContract && (
          <ContractCard
            noLinkAvatar
            contract={hoveredContract}
            key={hoveredContract.id}
            hideQuickBet
            className="align-center w-[300px]"
          />
        )}
      </Row>
    </div>
  )
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
