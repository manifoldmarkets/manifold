import { CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES, CreateableOutcomeType, MarketTierType } from 'common/contract'
import { ReactNode, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { formatMoney } from 'common/util/format'

import { ENV_CONFIG } from 'common/envs/constants'
import { Button } from 'web/components/buttons/button'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { Row } from '../layout/row'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { CoinNumber } from '../widgets/manaCoinNumber'
import { CrystalTier, PlusTier, PremiumTier } from 'web/public/custom-components/tiers'
import { getTieredCost } from 'common/economy'
import clsx from 'clsx'
import {capitalize} from 'lodash'

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
    <Col className="items-start">
      <label className="mb-1 gap-2 px-1 py-2">
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
    <div
      className={clsx(
        'grid w-full gap-2',
        outcomeType === 'NUMBER' ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
      )}
    >
      {outcomeType !== 'NUMBER' && (
        <Tier
          baseCost={baseCost}
          tier="basic"
          icon={<ManaCoin />}
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
  )
} 

function Tier(props:{baseCost: number, icon: ReactNode, tier: MarketTierType, outcomeType: CreateableOutcomeType, currentTier: MarketTierType, setMarketTier: (tier: MarketTierType) => void}) {
  const { baseCost, icon, tier, outcomeType, currentTier, setMarketTier } = props
  return (
    <Col className={clsx(currentTier == tier ?
      tier=='basic'?'outline outline-ink-500': 
      tier=='plus' ? 'outline outline-purple-500': 
      tier=='premium' ? 'outline outline-fuchsia-400':
      tier == 'crystal' ? 'outline outline-pink-500':'' :'','bg-canvas-50 hover:bg-canvas-0','items-center  w-full p-4 rounded')} onClick={()=>setMarketTier(tier)}>
      <div className="text-4xl">{icon}</div>
      {capitalize(tier)}
      <CoinNumber
        amount={getTieredCost(baseCost, tier, outcomeType)}
        numberType="short"
      />
    </Col>
  )
}