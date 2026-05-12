import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { SparklesIcon } from '@heroicons/react/solid'
import { FaCreditCard } from 'react-icons/fa6'
import { CurrencyDollarIcon } from '@heroicons/react/solid'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { formatMoney } from 'common/util/format'

function formatHmsRemaining(ms: number) {
  if (ms <= 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function PersonalizedOfferCard(props: {
  activeCount: number
  nextExpiresAt: number | null
  manaAmount: number
  priceUsdStripe: number
  priceUsdCrypto: number
  cryptoLoading: boolean
  cryptoDisabled: boolean
  creditCardDisabled: boolean
  onBuyWithCrypto: () => void
  onBuyWithCreditCard: () => void
}) {
  const {
    activeCount,
    nextExpiresAt,
    manaAmount,
    priceUsdStripe,
    priceUsdCrypto,
    cryptoLoading,
    cryptoDisabled,
    creditCardDisabled,
    onBuyWithCrypto,
    onBuyWithCreditCard,
  } = props

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!nextExpiresAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [nextExpiresAt])

  const remaining = nextExpiresAt != null ? nextExpiresAt - now : 0

  // Hide once the visible timer hits zero. New sessions can't be created past
  // expires_at (createcheckoutsession / create-daimo-session both validate
  // strictly), so hiding here keeps the UI honest. EXCEPTION: if a payment
  // session is mid-flight (cryptoLoading), keep the card mounted so the user
  // still sees their loading state / result. The backend's 1-hour redemption
  // grace will still honor an in-flight session even past expires_at.
  if (activeCount === 0) return null
  if (remaining <= 0 && !cryptoLoading) return null

  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-5 shadow-sm dark:border-amber-700/60 dark:from-amber-950/40 dark:via-yellow-950/40 dark:to-orange-950/40">
      <Row className="items-center justify-between gap-2">
        <Row className="items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-amber-500" />
          <span className="text-base font-bold text-amber-700 dark:text-amber-300">
            Your personalised mana sale
          </span>
        </Row>
        <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
          {activeCount} Available
        </span>
      </Row>

      <Col className="mt-3 gap-1">
        <Row className="items-baseline gap-2">
          <span className="text-2xl font-extrabold text-amber-700 dark:text-amber-200">
            {formatMoney(manaAmount)}
          </span>
          <span className="text-ink-600 text-sm">
            for ${priceUsdCrypto} (crypto) or ${priceUsdStripe} (card)
          </span>
        </Row>
        <p className="text-ink-600 text-xs">
          Thanks for your merch order! This discount expires in{' '}
          <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
            {formatHmsRemaining(remaining)}
          </span>
          .
        </p>
      </Col>

      <Col className="mt-4 gap-2">
        <button
          onClick={onBuyWithCrypto}
          disabled={cryptoDisabled || cryptoLoading}
          className={clsx(
            'group relative w-full overflow-hidden rounded-lg border-2 border-transparent',
            'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%]',
            'px-6 py-3 text-base font-semibold text-white shadow',
            'transition-all duration-300 hover:bg-[position:100%_0] hover:shadow-lg hover:shadow-indigo-500/25',
            'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Row className="items-center justify-center gap-2">
            {cryptoLoading ? (
              <>
                <LoadingIndicator size="sm" className="!text-white" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <CurrencyDollarIcon className="h-5 w-5" />
                <span>
                  Claim with crypto — ${priceUsdCrypto}
                </span>
              </>
            )}
          </Row>
        </button>

        <button
          onClick={onBuyWithCreditCard}
          disabled={creditCardDisabled}
          className={clsx(
            'group relative w-full overflow-hidden rounded-lg border-2',
            'px-6 py-3 text-base font-semibold shadow-sm transition-all',
            'active:scale-[0.98]',
            creditCardDisabled
              ? 'border-ink-300 bg-canvas-50 text-ink-500 cursor-not-allowed dark:bg-canvas-100'
              : 'bg-canvas-0 border-indigo-600 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-950/30'
          )}
        >
          <Row className="items-center justify-center gap-2">
            <FaCreditCard className="h-4 w-4" />
            <span>
              Claim with card — ${priceUsdStripe}
            </span>
          </Row>
        </button>
      </Col>
    </div>
  )
}
