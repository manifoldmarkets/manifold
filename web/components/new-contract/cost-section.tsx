import {
  CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES,
  CreateableOutcomeType,
} from 'common/contract'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'

import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { Button } from 'web/components/buttons/button'

import { TokenNumber } from '../widgets/token-number'
import { liquidityTiers } from 'common/tier'
import { getAnte } from 'common/economy'

export const CostSection = (props: {
  balance: number
  outcomeType: CreateableOutcomeType
  liquidityTier: number
  setLiquidityTier: (tier: number) => void
  numAnswers: number | undefined
}) => {
  const { balance, outcomeType, liquidityTier, setLiquidityTier, numAnswers } =
    props
  const ante = getAnte(outcomeType, numAnswers, liquidityTier)

  const [fundsModalOpen, setFundsModalOpen] = useState(false)
  return (
    <Col className="items-start px-1">
      <label className="mb-1 gap-2">
        <span>
          {CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES.includes(outcomeType)
            ? 'Cost'
            : 'Liquidity'}
        </span>
      </label>

      {!CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES.includes(outcomeType) && (
        <PriceSection
          liquidityTier={liquidityTier}
          setLiquidityTier={setLiquidityTier}
        />
      )}

      {ante > balance && (
        <div className="mb-2 mr-auto mt-2 self-center whitespace-nowrap text-xs font-medium tracking-wide">
          <span className="text-scarlet-500 mr-2">Insufficient balance</span>
          <Button
            size="xs"
            color="green"
            onClick={() => setFundsModalOpen(true)}
          >
            Get {ENV_CONFIG.moneyMoniker}
          </Button>
          <AddFundsModal open={fundsModalOpen} setOpen={setFundsModalOpen} />
        </div>
      )}
    </Col>
  )
}

function PriceSection(props: {
  liquidityTier: number
  setLiquidityTier: (tier: number) => void
}) {
  const { liquidityTier, setLiquidityTier } = props

  return (
    <Col className="w-full gap-2">
      <div className="text-ink-600 text-sm">
        More liquidity attracts more traders but has a higher cost.
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {liquidityTiers.map((tier) => (
          <Tier
            key={tier}
            currentTier={liquidityTier}
            liquidityTier={tier}
            setLiquidityTier={setLiquidityTier}
          />
        ))}
      </div>
    </Col>
  )
}

function Tier(props: {
  currentTier: number
  liquidityTier: number
  setLiquidityTier: (tier: number) => void
  isTierDisabled?: boolean
}) {
  const { currentTier, liquidityTier, setLiquidityTier, isTierDisabled } = props

  const tierIndex = liquidityTiers.findIndex((tier) => tier === liquidityTier)

  return (
    <div
      className={clsx(
        currentTier == liquidityTier
          ? tierIndex == 0
            ? 'ring-ink-500 ring-2'
            : tierIndex == 1
            ? 'ring-2 ring-blue-500'
            : tierIndex == 2
            ? 'ring-2 ring-purple-400'
            : 'ring-2 ring-pink-500'
          : tierIndex == 0
          ? 'hover:ring-ink-500/50 opacity-90 ring-transparent'
          : tierIndex == 1
          ? 'opacity-90 ring-transparent hover:ring-blue-500/50'
          : tierIndex == 2
          ? 'opacity-90 ring-transparent hover:ring-fuchsia-400/50'
          : 'opacity-90 ring-transparent hover:ring-pink-500/50',
        'bg-canvas-50 cursor-pointer ',
        'flex w-full select-none flex-row items-center gap-2 rounded px-4 py-2 ring transition-colors sm:flex-col sm:gap-0'
      )}
      onClick={() => {
        if (!isTierDisabled) {
          setLiquidityTier(liquidityTier)
        }
      }}
    >
      <Col className="sm:items-center">
        <TokenNumber
          className="text-xl font-semibold"
          amount={liquidityTier}
          numberType="short"
        />
      </Col>
    </div>
  )
}
