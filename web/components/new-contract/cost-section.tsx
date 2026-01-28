import {
  CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES,
  CreateableOutcomeType,
} from 'common/contract'
import { Col } from 'web/components/layout/col'

import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'
import Link from 'next/link'

import { TokenNumber } from '../widgets/token-number'
import { liquidityTiers } from 'common/tier'
import { getAnte, getUniqueBettorBonusAmount } from 'common/economy'
import { formatMoney } from 'common/util/format'

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

  return (
    <Col className="items-start px-1">
      {!CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES.includes(outcomeType) && (
        <PriceSection
          liquidityTier={liquidityTier}
          setLiquidityTier={setLiquidityTier}
          numAnswers={numAnswers}
          outcomeType={outcomeType}
        />
      )}
      {ante > balance && (
        <div className="mb-2 mr-auto mt-2 self-center whitespace-nowrap text-xs font-medium tracking-wide">
          <span className="text-scarlet-500 mr-2">Insufficient balance</span>
          <Link
            href="/checkout"
            className="rounded bg-teal-500 px-2 py-1 text-white hover:bg-teal-600"
          >
            Get {ENV_CONFIG.moneyMoniker}
          </Link>
        </div>
      )}
    </Col>
  )
}

function PriceSection(props: {
  liquidityTier: number
  setLiquidityTier: (tier: number) => void
  numAnswers: number | undefined
  outcomeType: CreateableOutcomeType
}) {
  const { liquidityTier, setLiquidityTier, numAnswers, outcomeType } = props

  // Use actual ante (which accounts for extra liquidity from many answers) for bonus calculation
  const ante = getAnte(outcomeType, numAnswers, liquidityTier)
  const bonus = getUniqueBettorBonusAmount(ante, numAnswers ?? 0)

  return (
    <Col className="w-full gap-2">
      <div className="text-ink-600 text-sm">
        More liquidity attracts more traders but has a higher cost.{' '}
        <span className="text-ink-700">
          {formatMoney(liquidityTier)} liquidity, earn{' '}
          <span className="text-ink-900 font-semibold">
            {formatMoney(bonus)}
          </span>{' '}
          for every unique trader
        </span>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {liquidityTiers.map((tier) => (
          <Tier
            key={tier}
            ante={getAnte(outcomeType, numAnswers, tier)}
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
  ante: number
  currentTier: number
  liquidityTier: number
  setLiquidityTier: (tier: number) => void
  isTierDisabled?: boolean
}) {
  const { ante, currentTier, liquidityTier, setLiquidityTier, isTierDisabled } =
    props

  const tierIndex = liquidityTiers.findIndex((tier) => tier === liquidityTier)
  return (
    <div
      className={clsx(
        currentTier == liquidityTier
          ? tierIndex == 0
            ? 'ring-2 ring-green-400'
            : tierIndex == 1
            ? 'ring-2 ring-blue-500'
            : tierIndex == 2
            ? 'ring-2 ring-purple-400'
            : 'ring-2 ring-pink-500'
          : tierIndex == 0
          ? 'opacity-90 ring-transparent hover:ring-green-500/50'
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
          amount={ante}
          numberType="short"
        />
      </Col>
    </div>
  )
}
