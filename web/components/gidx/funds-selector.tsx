import clsx from 'clsx'
import { WebPriceInDollars } from 'common/economy'
import { DOLLAR_PURCHASE_LIMIT } from 'common/envs/constants'
import { formatMoneyUSD } from 'common/util/format'
import { FaStore } from 'react-icons/fa6'
import {
  PriceTile,
  use24hrUsdPurchasesInDollars,
} from 'web/components/add-funds-modal'
import { CashoutLimitWarning } from 'web/components/bet/cashout-limit-warning'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { usePrices } from 'web/hooks/use-prices'
import { useUser } from 'web/hooks/use-user'
import { AlertBox } from '../widgets/alert-box'

export function FundsSelector(props: {
  onSelectPriceInDollars: (amount: WebPriceInDollars) => void
  loadingPrice: WebPriceInDollars | null
}) {
  const { onSelectPriceInDollars, loadingPrice } = props
  const basePrices = usePrices()
  const user = useUser()

  const prices = basePrices
  const totalPurchased = use24hrUsdPurchasesInDollars(user?.id || '')
  const pastLimit = totalPurchased >= DOLLAR_PURCHASE_LIMIT

  return (
    <Col className="mx-auto max-w-xl">
      <Row className="mb-2 items-center gap-1 text-2xl font-semibold">
        <FaStore className="h-6 w-6" />
        Buy mana
      </Row>
      <div className={clsx('text-ink-700 mb-4 text-sm')}>
        <div>
          <span>
            Buy mana to trade in your favorite questions. Not redeemable for
            cash.
          </span>
          <CashoutLimitWarning user={user} className="mt-2" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 gap-y-6">
        {prices
          .sort((a, b) => a.bonusInDollars - b.bonusInDollars)
          .map((amounts, index) => (
            <PriceTile
              key={`price-tile-${amounts.mana}`}
              amounts={amounts}
              index={index}
              loadingPrice={loadingPrice}
              disabled={pastLimit}
              user={user}
              onClick={() => onSelectPriceInDollars(amounts.priceInDollars)}
            />
          ))}
      </div>
      {pastLimit && (
        <AlertBox title="Purchase limit" className="my-4">
          You have reached your daily purchase limit of{' '}
          {formatMoneyUSD(DOLLAR_PURCHASE_LIMIT)}. Please try again tomorrow.
        </AlertBox>
      )}
    </Col>
  )
}
