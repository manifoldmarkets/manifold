import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { CurrencyDollarIcon } from '@heroicons/react/solid'
import { FaCreditCard } from 'react-icons/fa6'
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
  if (activeCount === 0) return null
  if (remaining <= 0 && !cryptoLoading) return null

  // Standard rate anchor for the savings callout: 100 mana / $1 USD.
  const baseUsd = Math.round(manaAmount / 100)
  const cryptoSavingsPct = Math.round(((baseUsd - priceUsdCrypto) / baseUsd) * 100)
  const stripeSavingsPct = Math.round(((baseUsd - priceUsdStripe) / baseUsd) * 100)

  return (
    <div className="animate-offer-card-in overflow-hidden rounded-xl border-2 border-orange-400 bg-canvas-0 shadow-lg ring-2 ring-amber-200/60 dark:border-orange-500 dark:ring-amber-800/40">
      {/* Header strip — high-contrast, draws the eye. On mobile: discount
          headline on top, count + timer centered below. On sm+: side-by-side. */}
      <div className="flex flex-col items-center gap-0.5 bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-white sm:flex-row sm:justify-between sm:gap-2">
        <Row className="items-center gap-1.5 text-sm font-bold uppercase tracking-wide sm:gap-2 sm:text-base sm:tracking-wider">
          <span>Up to {cryptoSavingsPct}% off mana</span>
        </Row>
        <Row className="items-center gap-1.5 text-sm font-bold uppercase tracking-wide sm:gap-2 sm:text-base sm:tracking-wider">
          {activeCount > 1 && (
            <>
              <span>{activeCount} left</span>
              <span className="text-amber-100/80">·</span>
            </>
          )}
          <span className="tabular-nums">{formatHmsRemaining(remaining)}</span>
        </Row>
      </div>

      {/* Body */}
      <Col className="gap-4 p-5">
        <Col className="items-center gap-1">
          <Row className="items-baseline gap-2">
            <span className="text-3xl font-extrabold text-orange-700 dark:text-amber-300 sm:text-4xl">
              {formatMoney(manaAmount)}
            </span>
            <span className="text-ink-500 text-sm">mana</span>
          </Row>
        </Col>

        <Col className="mx-auto mt-1 w-full max-w-sm gap-3">
          <button
            onClick={onBuyWithCrypto}
            disabled={cryptoDisabled || cryptoLoading}
            className={clsx(
              'group relative w-full rounded-xl border-2 border-transparent',
              'flex min-h-[60px] items-center justify-center',
              'bg-gradient-to-r from-orange-500 to-amber-500',
              'px-4 py-4 text-base font-semibold text-white shadow-lg sm:px-8 sm:text-lg',
              'transition-all duration-200 hover:shadow-xl hover:shadow-orange-500/30 hover:brightness-110',
              'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <span className="pointer-events-none absolute -top-3 -right-3 rotate-6 select-none whitespace-nowrap rounded-full border border-emerald-300 bg-emerald-500 px-2.5 py-1 text-sm font-extrabold uppercase tracking-wide text-white shadow">
              −{cryptoSavingsPct}%
            </span>
            <Row className="items-center justify-center gap-2">
              {cryptoLoading ? (
                <>
                  <LoadingIndicator size="sm" className="!text-white" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <CurrencyDollarIcon className="h-6 w-6 shrink-0" />
                  <span>
                    Claim with crypto{' '}
                    <span className="whitespace-nowrap">
                      <span className="text-xl font-bold opacity-60 line-through">
                        ${baseUsd}
                      </span>{' '}
                      <span className="text-xl font-bold">${priceUsdCrypto}</span>
                    </span>
                  </span>
                </>
              )}
            </Row>
          </button>

          <button
            onClick={onBuyWithCreditCard}
            disabled={creditCardDisabled}
            className={clsx(
              'group relative w-full rounded-xl border-2',
              'flex min-h-[60px] items-center justify-center',
              'px-4 py-4 text-base font-semibold shadow-sm transition-all sm:px-8 sm:text-lg',
              'active:scale-[0.98]',
              creditCardDisabled
                ? 'border-ink-300 bg-canvas-50 text-ink-500 cursor-not-allowed dark:bg-canvas-100'
                : 'bg-canvas-0 border-orange-500 text-orange-700 hover:bg-orange-50 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-950/30'
            )}
          >
            <span className="pointer-events-none absolute -top-3 -right-3 rotate-6 select-none whitespace-nowrap rounded-full border border-emerald-300 bg-emerald-500 px-2.5 py-1 text-sm font-extrabold uppercase tracking-wide text-white shadow">
              −{stripeSavingsPct}%
            </span>
            <Row className="items-center justify-center gap-2">
              <FaCreditCard className="h-5 w-5 shrink-0" />
              <span>
                {/* Invisible padding matches "crypto" (6 chars) vs "card" (4
                    chars) so this label takes the same width as the other
                    button's, forcing them to wrap to a second line at the
                    same viewport width instead of one wrapping alone. */}
                <span className="invisible">m</span>Claim with card{' '}
                <span className="whitespace-nowrap">
                  <span className="text-xl font-bold opacity-60 line-through">
                    ${baseUsd}
                  </span>{' '}
                  <span className="text-xl font-bold">${priceUsdStripe}</span>
                </span>
              </span>
            </Row>
          </button>
        </Col>

        <p className="text-ink-500 mt-1 text-center text-xs">
          This mana offer is personal to you, and will expire when time runs
          out.
        </p>
      </Col>
    </div>
  )
}
