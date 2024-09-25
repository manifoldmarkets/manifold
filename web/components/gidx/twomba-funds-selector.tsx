import { WebManaAmounts } from 'common/economy'
import { usePrices } from 'web/hooks/use-prices'
import { useUser } from 'web/hooks/use-user'
import { introductoryTimeWindow } from 'common/user'
import { DOLLAR_PURCHASE_LIMIT, TWOMBA_ENABLED } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { FaStore } from 'react-icons/fa6'
import clsx from 'clsx'
import { CashoutLimitWarning } from 'web/components/bet/cashout-limit-warning'
import { Countdown } from 'web/components/widgets/countdown'
import {
  PriceTile,
  use24hrUsdPurchasesInDollars,
} from 'web/components/add-funds-modal'
import Link from 'next/link'
import { AlertBox } from '../widgets/alert-box'
import { formatMoneyUSD } from 'common/util/format'

export function TwombaFundsSelector(props: {
  onSelect: (amount: WebManaAmounts) => void
  loading: WebManaAmounts | null
}) {
  const { onSelect, loading } = props
  const basePrices = usePrices()
  const user = useUser()
  const expirationStart = user
    ? new Date(introductoryTimeWindow(user))
    : new Date()
  const eligibleForNewUserOffer =
    user && Date.now() < expirationStart.valueOf() && !user.purchasedMana
  const newUserPrices = basePrices.filter((p) => p.newUsersOnly)
  const prices = basePrices.filter((p) => !p.newUsersOnly)
  const totalPurchased = use24hrUsdPurchasesInDollars(user?.id || '')
  const pastLimit = totalPurchased >= DOLLAR_PURCHASE_LIMIT

  if (!TWOMBA_ENABLED) {
    return <div>Sweepstaked are not enabled, sorry!</div>
  }

  return (
    <Col className="mx-auto max-w-xl">
      <Row className="mb-2 items-center gap-1 text-2xl font-semibold">
        <FaStore className="h-6 w-6" />
        Mana Shop
      </Row>
      <div className={clsx('text-ink-700 mb-4 text-sm')}>
        <div>
          <span>
            Buy mana to trade in your favorite questions. Always free to play,
            no purchase necessary.
          </span>
          <CashoutLimitWarning user={user} className="mt-2" />
        </div>
      </div>
      {eligibleForNewUserOffer && (
        <>
          <span className="text-2xl text-blue-500">
            Introductory discount expires in{' '}
            <Countdown
              includeSeconds
              endDate={expirationStart}
              className="ml-1 "
            />
          </span>
          <Col className="mb-2 gap-2 py-4">
            <div className="grid grid-cols-2 gap-4 gap-y-6">
              {newUserPrices.map((amounts, index) => (
                <PriceTile
                  key={`price-tile-${amounts.mana}`}
                  amounts={amounts}
                  index={index}
                  loading={loading}
                  disabled={pastLimit}
                  onClick={() => onSelect(amounts.mana)}
                />
              ))}
            </div>
          </Col>
        </>
      )}
      <div className="grid grid-cols-2 gap-4 gap-y-6">
        {prices.map((amounts, index) => (
          <PriceTile
            key={`price-tile-${amounts.mana}`}
            amounts={amounts}
            index={index}
            loading={loading}
            disabled={pastLimit}
            onClick={() => onSelect(amounts.mana)}
          />
        ))}
      </div>
      {pastLimit && (
        <AlertBox title="Purchase limit" className="my-4">
          You have reached your daily purchase limit of{' '}
          {formatMoneyUSD(DOLLAR_PURCHASE_LIMIT)}. Please try again tomorrow.
        </AlertBox>
      )}
      <div className="text-ink-500 mt-4 text-sm">
        Please see our{' '}
        <Link href="/terms" target="_blank" className="underline">
          Terms & Conditions
        </Link>{' '}
        and{' '}
        <Link href="/sweepstakes-rules" target="_blank" className="underline">
          Sweepstakes Rules
        </Link>
        . All sales are final. No refunds.
      </div>
    </Col>
  )
}
