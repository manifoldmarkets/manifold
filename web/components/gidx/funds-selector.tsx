import clsx from 'clsx'
import { WebPriceInDollars } from 'common/economy'
import { DOLLAR_PURCHASE_LIMIT } from 'common/envs/constants'
import { introductoryTimeWindow } from 'common/user'
import { formatMoneyUSD } from 'common/util/format'
import Link from 'next/link'
import { FaStore } from 'react-icons/fa6'
import {
  PriceTile,
  use24hrUsdPurchasesInDollars,
} from 'web/components/add-funds-modal'
import { CashoutLimitWarning } from 'web/components/bet/cashout-limit-warning'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useIsNativeIOS } from 'web/components/native-message-provider'
import { Countdown } from 'web/components/widgets/countdown'
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

  const expirationStart = user
    ? new Date(introductoryTimeWindow(user))
    : new Date()

  const isNativeIOS = useIsNativeIOS()
  const eligibleForNewUserOffer =
    user &&
    Date.now() < expirationStart.valueOf() &&
    !user.purchasedSweepcash &&
    !isNativeIOS

  const newUserPrices = basePrices.filter((p) => p.newUsersOnly)
  const prices = basePrices.filter((p) => !p.newUsersOnly)
  const totalPurchased = use24hrUsdPurchasesInDollars(user?.id || '')
  const pastLimit = totalPurchased >= DOLLAR_PURCHASE_LIMIT

  return (
    <Col className="mx-auto max-w-xl">
      <Row className="mb-2 items-center gap-1 text-2xl font-semibold">
        <FaStore className="h-6 w-6" />
        Mana Shop
      </Row>
      <div className={clsx('text-ink-700 mb-4 text-sm')}>
        <div>
          <span>
            Buy mana to trade in your favorite questions. Only sweepcash won
            from sweepstakes questions is{' '}
            <Link href="/redeem" className="underline">
              redeemable for cash
            </Link>
            . Always free to play, no purchase necessary.
          </span>
          <CashoutLimitWarning user={user} className="mt-2" />
        </div>
      </div>

      <div className="mx-auto mb-8 max-w-xl rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-700 dark:bg-indigo-900">
        <p className="text-indigo-700 dark:text-indigo-300">
          🇺🇸🗳️ <span className="font-semibold">Special Election Offer</span>:
          Get 5% off purchases between $5,000 - $250,000! Contact{' '}
          <a
            href="mailto:info@manifold.markets"
            className="underline hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            info@manifold.markets
          </a>{' '}
          for details.
        </p>
      </div>

      {(!user || !user.sweepstakesVerified) && !isNativeIOS && (
        <>
          <Row className="items-baseline justify-between text-3xl text-green-500">
            Verify for limited time offer!
          </Row>
          <Col className="mb-2 gap-2 py-4">
            <div className="grid grid-cols-2 gap-4 gap-y-6">
              {newUserPrices.map((amounts, index) => (
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
          </Col>
        </>
      )}

      {eligibleForNewUserOffer && (
        <>
          <Row className="items-baseline justify-between text-3xl text-green-500">
            Welcome Deal
            <span className="text-lg text-green-500">
              expires in{' '}
              <Countdown
                includeSeconds
                endDate={expirationStart}
                className="ml-1 "
              />
            </span>
          </Row>
          <Col className="mb-2 gap-2 py-4">
            <div className="grid grid-cols-2 gap-4 gap-y-6">
              {newUserPrices.map((amounts, index) => (
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
          </Col>
        </>
      )}
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

      <div className="text-ink-500 mt-4 text-sm">
        Please see our{' '}
        <Link href="/terms" target="_blank" className="underline">
          Terms & Conditions
        </Link>
        ,{' '}
        <Link href="/mana-only-terms" target="_blank" className="underline">
          Mana-only Terms of Service
        </Link>
        , and{' '}
        <Link href="/sweepstakes-rules" target="_blank" className="underline">
          Sweepstakes Rules
        </Link>
        . All sales are final. No refunds.
      </div>
    </Col>
  )
}
