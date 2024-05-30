import { CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES, CreateableOutcomeType, MarketTierType } from 'common/contract'
import { ReactNode, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'

import clsx from 'clsx'
import { getTieredCost } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { capitalize } from 'lodash'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { Button } from 'web/components/buttons/button'
import { CrystalTier, PlusTier, PremiumTier } from 'web/public/custom-components/tiers'
import { LogoIcon } from '../icons/logo-icon'
import { CoinNumber } from '../widgets/manaCoinNumber'

export const CostSection = (props: {
  balance: number
  outcomeType: CreateableOutcomeType
  baseCost: number
  marketTier: MarketTierType
  setMarketTier: (tier: MarketTierType) => void
}) => {
  const { balance, outcomeType, baseCost, marketTier, setMarketTier } = props
  const [fundsModalOpen, setFundsModalOpen] = useState(false)
  const currentCost = getTieredCost(baseCost, marketTier, outcomeType)
  return (
    <Col className="items-start px-1">
      <label className="mb-1 gap-2">
        <span>Cost </span>
        <InfoTooltip
          text={
            outcomeType == 'BOUNTIED_QUESTION'
              ? 'Your bounty. This amount is put upfront.'
              : outcomeType == 'POLL'
              ? 'Cost to create your poll.'
              : `Cost to create your question. This amount is used to subsidize predictions.`
          }
        />
      </label>

      <PriceSection baseCost={baseCost} outcomeType={outcomeType} currentTier = {marketTier} setMarketTier={setMarketTier}/>

      {currentCost > balance && (
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


function PriceSection(props:{baseCost: number, outcomeType: CreateableOutcomeType, currentTier: MarketTierType, setMarketTier: (tier: MarketTierType) => void}) {
  const { baseCost, outcomeType, currentTier, setMarketTier } = props

  if (CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES.includes(outcomeType)) {
    return <CoinNumber amount={getTieredCost(baseCost, 'basic', outcomeType)} />
  }
  return (
    <Col className="gap-2 w-full">
    <div className="text-sm text-ink-600">
    Choose a tier to determine the cost of creating your question. Higher tiers offer more rewards, which will attract more bettors!
    </div>
      <div
        className={clsx(
          'grid w-full gap-2',
          outcomeType === 'NUMBER'
            ? 'grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-4'
        )}
      >
        {outcomeType !== 'NUMBER' && (
          <Tier
            baseCost={baseCost}
            tier="basic"
            icon={
              <LogoIcon
                className="stroke-ink-600 h-[1em] w-[1em] shrink-0 transition-transform"
                aria-hidden
              />
            }
            outcomeType={outcomeType}
            currentTier={currentTier}
            setMarketTier={setMarketTier}
          />
        )}
        <Tier
          baseCost={baseCost}
          tier="plus"
          icon={<PlusTier />}
          outcomeType={outcomeType}
          currentTier={currentTier}
          setMarketTier={setMarketTier}
        />
        <Tier
          baseCost={baseCost}
          tier="premium"
          icon={<PremiumTier />}
          outcomeType={outcomeType}
          currentTier={currentTier}
          setMarketTier={setMarketTier}
        />
        <Tier
          baseCost={baseCost}
          tier="crystal"
          icon={<CrystalTier />}
          outcomeType={outcomeType}
          currentTier={currentTier}
          setMarketTier={setMarketTier}
        />
      </div>
    </Col>
  )
} 

function Tier(props:{baseCost: number, icon: ReactNode, tier: MarketTierType, outcomeType: CreateableOutcomeType, currentTier: MarketTierType, setMarketTier: (tier: MarketTierType) => void}) {
  const { baseCost, icon, tier, outcomeType, currentTier, setMarketTier } = props
  return (
    <div
      className={clsx(
        currentTier == tier
          ? tier == 'basic'
            ? 'outline-ink-500'
            : tier == 'plus'
            ? 'outline-purple-500'
            : tier == 'premium'
            ? 'outline-fuchsia-400'
            : 'outline-pink-500'
          : tier == 'basic'
          ? 'hover:outline-ink-500/50 opacity-50 outline-transparent'
          : tier == 'plus'
          ? 'opacity-50 outline-transparent hover:outline-purple-500/50'
          : tier == 'premium'
          ? 'opacity-50 outline-transparent hover:outline-fuchsia-400/50'
          : 'opacity-50 outline-transparent hover:outline-pink-500/50',
        'bg-canvas-50 w-full cursor-pointer select-none items-center rounded px-4 py-2 outline transition-colors',
        'flex flex-row sm:flex-col gap-2 sm:gap-0'
      )}
      onClick={() => setMarketTier(tier)}
    >
      <div className="text-5xl sm:text-4xl">{icon}</div>
      <Col className="sm:items-center">
        <div className="text-ink-600">{capitalize(tier)}</div>
        <CoinNumber
          className="text-xl font-semibold"
          amount={getTieredCost(baseCost, tier, outcomeType)}
          numberType="short"
        />
      </Col>
    </div>
  )
}