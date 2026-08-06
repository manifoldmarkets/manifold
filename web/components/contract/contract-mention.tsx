import { formatTime } from 'client-common/lib/time'
import clsx from 'clsx'
import { Contract, contractPath } from 'common/contract'
import { TRADED_TERM } from 'common/envs/constants'
import {
  formatPrice as formatPerpPrice,
  inferPriceDecimals as inferPerpPriceDecimals,
} from 'common/perps/format'
import { formatWithToken } from 'common/util/format'
import Link from 'next/link'
import { useIsClient } from 'web/hooks/use-is-client'
import { track } from 'web/lib/service/analytics'
import { ContractStatusLabel } from './contracts-table'
import { getTextColor } from './text-color'
import { LogoIcon } from '../icons/logo-icon'
import { PerpMarketBadge } from '../perps/perp-market-badge'

export function ContractMention(props: {
  contract: Contract
  probChange?: string
  className?: string
  textClassName?: string
  trackingLocation?: string
}) {
  const { contract, probChange, className, textClassName, trackingLocation } =
    props
  const probTextColor = getTextColor(contract)
  const isClient = useIsClient()
  const isPerp = contract.outcomeType === 'PERP'
  const perpPrice = isPerp ? Number(contract.oraclePrice) : undefined

  return (
    <Link
      href={contractPath(contract)}
      className={clsx(
        'group/mention inline whitespace-nowrap rounded-sm',
        className
      )}
      title={isClient ? tooltipLabel(contract) : undefined}
      onClick={() => {
        track('contract mention click', {
          contractId: contract.id,
          trackingLocation,
        })
      }}
      // target={getIsNative() ? '_self' : '_blank'}
    >
      <LogoIcon
        aria-hidden
        className="mr-1 inline h-[1em] w-[1em] stroke-indigo-700 align-text-bottom dark:stroke-white"
      />
      {isPerp && <PerpMarketBadge className="mr-1 align-bottom" />}
      <span
        className={clsx(
          'break-anywhere group-hover/mention:text-primary-500 group-focus/mention:text-primary-500 text-primary-800  mr-0.5 whitespace-normal font-medium transition-colors',
          textClassName
        )}
      >
        {contract.question}
      </span>
      {contract.outcomeType === 'BINARY' && (
        <span
          className={clsx(
            probTextColor,
            'ring-primary-100 group-hover/mention:ring-primary-200 inline-flex rounded-full px-2 align-bottom font-semibold ring-1 ring-inset transition-colors',
            textClassName
          )}
        >
          <ContractStatusLabel contract={contract} />
        </span>
      )}
      {isPerp && (
        <span className="inline-flex items-center gap-1 align-bottom">
          {perpPrice !== undefined && Number.isFinite(perpPrice) && (
            <span
              className={clsx(
                probTextColor,
                'ring-primary-100 group-hover/mention:ring-primary-200 inline-flex rounded-full px-2 font-semibold tabular-nums ring-1 ring-inset transition-colors',
                textClassName
              )}
            >
              {formatPerpPrice(perpPrice, inferPerpPriceDecimals([perpPrice]))}
            </span>
          )}
        </span>
      )}
      {!contract.resolution && probChange && (
        <span className="text-ink-500 ml-0.5 text-xs">{probChange}</span>
      )}
      &zwnj;{/* cursor positioning hack */}
    </Link>
  )
}

function tooltipLabel(contract: Contract) {
  const { resolutionTime, creatorName, volume, closeTime } = contract
  const isCashContract = contract.token === 'CASH'
  const dateFormat = resolutionTime
    ? `Resolved ${formatTime(resolutionTime)}`
    : contract.outcomeType === 'PERP' && closeTime == null
    ? 'Perpetual market'
    : closeTime == null
    ? 'Never closes'
    : `${closeTime < Date.now() ? 'Closed' : 'Closes'} ${formatTime(closeTime)}`

  return `By ${creatorName}. ${formatWithToken({
    amount: volume,
    token: isCashContract ? 'CASH' : 'M$',
  })} ${TRADED_TERM}. ${dateFormat}`
}
