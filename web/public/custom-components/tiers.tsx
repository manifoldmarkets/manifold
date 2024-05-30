import clsx from "clsx"
import { Contract, MarketTierType } from "common/contract";
import { Tooltip } from "web/components/widgets/tooltip";
import { capitalize } from 'lodash'
import { getAnte, getTieredCost } from "common/economy";
import { shortenNumber } from "web/lib/util/formatNumber";


export function PlusTier(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/market-tiers/Plus.svg"
      alt={'➕'}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}

export function PremiumTier(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/market-tiers/Premium.svg"
      alt={'💎'}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}

export function CrystalTier(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/market-tiers/Crystal.svg"
      alt={'🔮'}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}


