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
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { getContractTypeFromValue } from './create-contract-types'
import { InfoTooltip } from '../widgets/info-tooltip'
import { capitalize } from 'lodash'
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

      <PriceSection
        ante={ante}
        outcomeType={outcomeType}
        liquidityTier={liquidityTier}
        setLiquidityTier={setLiquidityTier}
      />

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
  ante: number
  outcomeType: CreateableOutcomeType
  liquidityTier: number
  setLiquidityTier: (tier: number) => void
}) {
  const { ante, outcomeType, liquidityTier, setLiquidityTier } = props

  return (
    <Col className="w-full gap-2">
      <div className="text-ink-600 text-sm">
        More liquidity attracts more traders but has a higher cost.
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {liquidityTiers.map((tier) => (
          <Tier
            key={tier}
            cost={ante}
            currentTier={liquidityTier}
            outcomeType={outcomeType}
            liquidityTier={tier}
            setLiquidityTier={setLiquidityTier}
          />
        ))}
      </div>
    </Col>
  )
}

function Tier(props: {
  cost: number
  currentTier: number
  outcomeType: CreateableOutcomeType
  liquidityTier: number
  setLiquidityTier: (tier: number) => void
  isTierDisabled?: boolean
}) {
  const {
    cost,
    currentTier,
    outcomeType,
    liquidityTier,
    setLiquidityTier,
    isTierDisabled,
  } = props

  const questionType = capitalize(getContractTypeFromValue(outcomeType, 'name'))
  const tierIndex = liquidityTiers.findIndex((tier) => tier === liquidityTier)

  if (isTierDisabled) {
    return (
      <div
        className={clsx(
          'bg-canvas-50 w-full select-none items-baseline rounded py-2 pl-2 pr-4 transition-colors',
          'flex flex-row justify-start gap-3 sm:flex-col sm:items-center sm:justify-between sm:gap-0'
        )}
      >
        <div className="text-ink-500 flex flex-col items-center gap-1 text-sm font-bold sm:flex-row sm:items-start">
          <div>Disabled</div>
          <InfoTooltip
            text={`The ${questionType} question type does not work with the this tier because it requires more liquidity.`}
          />
        </div>
        <Col className="sm:items-center">
          <div
            className="text-xl opacity-50"
            style={{ filter: 'saturate(0%)' }}
          >
            <ManaCoin />
          </div>
        </Col>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        currentTier == liquidityTier
          ? tierIndex == 0
            ? 'outline-ink-500'
            : tierIndex == 1
            ? 'outline-blue-500'
            : tierIndex == 2
            ? 'outline-purple-400'
            : 'outline-pink-500'
          : tierIndex == 0
          ? 'hover:outline-ink-500/50 opacity-50 outline-transparent'
          : tierIndex == 1
          ? 'opacity-50 outline-transparent hover:outline-purple-500/50'
          : tierIndex == 2
          ? 'opacity-50 outline-transparent hover:outline-fuchsia-400/50'
          : 'opacity-50 outline-transparent hover:outline-pink-500/50',
        'bg-canvas-50 cursor-pointer ',
        'flex w-full select-none flex-row items-center gap-2 rounded px-4 py-2 outline transition-colors sm:flex-col sm:gap-0'
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
