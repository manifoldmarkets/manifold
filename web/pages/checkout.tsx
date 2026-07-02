'use client'
import { DaimoModal } from '@daimo/sdk/web'
import clsx from 'clsx'
import { useRouter } from 'next/router'

import { isUserBanned } from 'common/ban-utils'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { DaimoProviders } from 'web/components/crypto/crypto-providers'
import { SEO } from 'web/components/SEO'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useEffect, useRef, useState } from 'react'
import { usePersonalizedManaOffers } from 'web/hooks/use-personalized-mana-offers'
import { PersonalizedOfferCard } from 'web/components/checkout/personalized-offer-card'
import { HiddenOfferChip } from 'web/components/checkout/hidden-offer-chip'
import { checkoutURL } from 'web/lib/service/stripe'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Button } from 'web/components/buttons/button'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { PriceTile } from 'web/components/add-funds-modal'
import { usePrices } from 'web/hooks/use-prices'
import {
  CurrencyDollarIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  GiftIcon,
  BanIcon,
} from '@heroicons/react/solid'
import { FaCreditCard } from 'react-icons/fa6'
import Image from 'next/image'
import Link from 'next/link'
import {
  CRYPTO_BULK_PURCHASE_BONUS_PCT,
  CRYPTO_BULK_THRESHOLD_DISPLAY,
  CRYPTO_FIRST_PURCHASE_BONUS_PCT,
  CRYPTO_MANA_PER_DOLLAR,
} from 'common/economy'
import { formatMoney } from 'common/util/format'
import { api } from 'web/lib/api/api'

const MANA_TIERS_USD = [10, 25, 50, 100, 500, 1000, 2500]

type SessionState =
  | { status: 'idle' }
  | { status: 'creating' }
  | {
      status: 'ready'
      sessionId: string
      clientSecret: string
      // Captured at session creation so the lock release on close uses the
      // exact offer the lock was taken on — not the live effectiveOfferId,
      // which can flip to null if the user dismisses during payment.
      offerId: string | null
    }
  | { status: 'completed' }
  | { status: 'error'; message: string }

function ManaRewardsTable(props: { isFirstCryptoPurchase: boolean }) {
  const { isFirstCryptoPurchase } = props
  return (
    <Col className="gap-2">
      <Row className="items-center justify-between">
        <span className="text-ink-700 text-sm font-semibold">
          What you'll get
        </span>
        {isFirstCryptoPurchase && (
          <Row className="items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <SparklesIcon className="h-3.5 w-3.5" />
            First-purchase +10% applied
          </Row>
        )}
      </Row>
      <div className="border-ink-200 dark:border-ink-300 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-canvas-50 text-ink-600 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Pay</th>
              <th className="px-3 py-2 text-right font-medium">You get</th>
              <th className="px-3 py-2 text-right font-medium">Bonus</th>
            </tr>
          </thead>
          <tbody className="divide-ink-100 dark:divide-ink-200 divide-y">
            {MANA_TIERS_USD.map((dollars) => {
              const base = dollars * CRYPTO_MANA_PER_DOLLAR
              const bulkBonus =
                dollars >= CRYPTO_BULK_THRESHOLD_DISPLAY
                  ? Math.floor(base * CRYPTO_BULK_PURCHASE_BONUS_PCT)
                  : 0
              const firstBonus = isFirstCryptoPurchase
                ? Math.floor(base * CRYPTO_FIRST_PURCHASE_BONUS_PCT)
                : 0
              const bonus = bulkBonus + firstBonus
              const total = base + bonus
              const isBulk = dollars >= CRYPTO_BULK_THRESHOLD_DISPLAY
              return (
                <tr
                  key={dollars}
                  className={clsx(
                    isBulk &&
                      'bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 dark:from-amber-950/30 dark:via-yellow-950/30 dark:to-amber-950/30'
                  )}
                >
                  <td className="text-ink-800 px-3 py-2 font-medium">
                    ${dollars.toLocaleString()}
                  </td>
                  <td
                    className={clsx(
                      'px-3 py-2 text-right font-semibold',
                      isBulk
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-ink-900'
                    )}
                  >
                    {isBulk && (
                      <SparklesIcon className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
                    )}
                    {formatMoney(total)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {bonus > 0 ? (
                      <span
                        className={clsx(
                          'font-semibold',
                          isBulk
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        )}
                      >
                        +{formatMoney(bonus)}
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-ink-500 text-xs">
        $1 USDC = {formatMoney(CRYPTO_MANA_PER_DOLLAR)}. Purchases of $
        {CRYPTO_BULK_THRESHOLD_DISPLAY.toLocaleString()}+ receive a{' '}
        {Math.round(CRYPTO_BULK_PURCHASE_BONUS_PCT * 100)}% bulk bonus
        {isFirstCryptoPurchase
          ? ', which stacks with your first-purchase bonus.'
          : '.'}
      </p>
    </Col>
  )
}

function CreditCardPurchaseGrid() {
  const user = useUser()
  const prices = usePrices()
  const [loadingPrice, setLoadingPrice] = useState<number | null>(null)

  return (
    <div className="grid grid-cols-2 gap-4 gap-y-6">
      {prices
        .slice()
        .sort((a, b) => a.priceInDollars - b.priceInDollars)
        .map((amounts, index) => (
          <PriceTile
            key={`price-tile-${amounts.mana}`}
            amounts={amounts}
            index={index}
            loadingPrice={loadingPrice as any}
            disabled={false}
            user={user}
            onClick={() => setLoadingPrice(amounts.priceInDollars)}
          />
        ))}
    </div>
  )
}

function CheckoutContent() {
  const user = useUser()
  const [sessionState, setSessionState] = useState<SessionState>({
    status: 'idle',
  })
  const [creditCardModalOpen, setCreditCardModalOpen] = useState(false)

  // Check if user has made a crypto purchase before
  const { data: cryptoStatus } = useAPIGetter('get-crypto-purchase-status', {})
  const isFirstCryptoPurchase = cryptoStatus
    ? !cryptoStatus.hasCryptoPurchase
    : true // Default to true while loading

  // Check if user is banned from purchasing
  const { data: userBansData } = useAPIGetter(
    'get-user-bans',
    user?.id ? { userId: user.id } : undefined
  )
  const isPurchaseBanned = userBansData?.bans
    ? isUserBanned(userBansData.bans as any, 'purchase')
    : false
  const canPay = !!user?.id && !isPurchaseBanned

  const offers = usePersonalizedManaOffers()
  const router = useRouter()
  // ?showOffer=1 is set by the personalized-offer notification deep link.
  // When the user has only dismissed offers, this temporarily forces the
  // card to render so they can still redeem from the notification. Does
  // NOT mutate dismiss state — if they dismiss again or refresh without
  // the param, the chip-only view returns.
  const overrideShowOffer =
    router.query.showOffer === '1' && offers.dismissedCount > 0

  const activatedRef = useRef(false)
  useEffect(() => {
    if (!user?.id || activatedRef.current) return
    if (offers.pendingCount > 0) {
      activatedRef.current = true
      api('activate-personalized-mana-offers', {})
        .then(() => offers.refresh())
        .catch((e) => console.error('Offer activation failed:', e))
    }
  }, [user?.id, offers.pendingCount])

  // Two ways the card can be visible: (1) the user has non-dismissed active
  // offers, (2) override path from the notification when they only have
  // dismissed-but-active offers. In the override-only case we render the
  // card using the dismissed bucket's data and hide the X (dismissing again
  // would just bounce them since the URL still says showOffer=1).
  const isOverrideOnly = offers.activeCount === 0 && overrideShowOffer
  const effectiveActiveCount = isOverrideOnly
    ? offers.dismissedCount
    : offers.activeCount
  const effectiveNextExpiresAt = isOverrideOnly
    ? offers.dismissedNextExpiresAt
    : offers.nextExpiresAt
  const effectiveOfferId = isOverrideOnly
    ? offers.dismissedNextRedeemableOfferId
    : offers.nextRedeemableOfferId

  const handleBuyManaClick = async (offerId?: string) => {
    if (!canPay) return

    setSessionState({ status: 'creating' })

    try {
      const result = await api(
        'create-daimo-session',
        offerId ? { offerId } : {}
      )
      setSessionState({
        status: 'ready',
        sessionId: result.sessionId,
        clientSecret: result.clientSecret,
        offerId: offerId ?? null,
      })
    } catch (e: unknown) {
      // 409 = another payment session is already in flight for this offer.
      // Surface a specific message so the user understands what to do.
      const message =
        e instanceof Error && /already in progress/i.test(e.message)
          ? 'You already have a checkout in progress for this offer. Complete or close it first.'
          : 'Failed to start payment. Please try again.'
      console.error('Failed to create Daimo session:', e)
      setSessionState({ status: 'error', message })
      // Refresh in case server state changed (e.g. offer just redeemed elsewhere).
      offers.refresh()
    }
  }

  const handleOfferStripe = () => {
    if (!user?.id || !effectiveOfferId || !canPay) return
    // /createcheckoutsession is POST-only on the backend; navigate via a
    // programmatic form submission (matches AddFundsModal's pattern).
    const action = checkoutURL(
      user.id,
      offers.priceUsdStripe,
      typeof window !== 'undefined' ? window.location.href : '',
      effectiveOfferId
    )
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = action
    document.body.appendChild(form)
    form.submit()
  }

  const handlePaymentCompleted = () => {
    setSessionState({ status: 'completed' })
  }

  // After a successful Daimo payment the webhook commits offer redemption
  // server-side. A brief delay catches the typical webhook latency so the
  // next render sees fresh offer state. useEffect cleanup cancels the
  // timer if the user navigates away before it fires.
  useEffect(() => {
    if (sessionState.status !== 'completed') return
    const t = setTimeout(() => offers.refresh(), 1500)
    return () => clearTimeout(t)
  }, [sessionState.status])

  const handleModalClose = () => {
    const wasReady = sessionState.status === 'ready'
    // Capture the session's offerId BEFORE clearing state — handleModalClose
    // is called when the Daimo modal closes (abandoned or completed), and
    // by the time the release fires the user may have dismissed, so
    // effectiveOfferId could be null. The session-captured value is the
    // exact lock that was taken.
    const sessionOfferId =
      sessionState.status === 'ready' ? sessionState.offerId : null
    if (wasReady) {
      setSessionState({ status: 'idle' })
    }
    // If the user abandoned a personalized-offer session, release the pending
    // lock server-side so they can immediately retry. The 30-minute TTL would
    // catch it eventually, but this is instant.
    if (wasReady && sessionOfferId) {
      api('release-personalized-mana-offer-lock', {
        offerId: sessionOfferId,
      }).catch((e) =>
        console.warn('Failed to release personalized offer lock:', e)
      )
    }
    // Refresh on abandon too — the offer may have expired or been voided
    // while the modal was open.
    offers.refresh()
  }

  // Ticking clock for the offer countdown. Keyed on the offer's expiry so it
  // stays inert when there's no offer. This is the single source of truth for
  // "now" — passed down to the card too — so the gate below and the card's own
  // render decision read the same clock and can never disagree (which is what
  // produced the blank "active but expired" dead zone).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!effectiveNextExpiresAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [effectiveNextExpiresAt])

  const cryptoLoading =
    sessionState.status === 'creating' || sessionState.status === 'ready'

  // The offer card and hidden-offer chip nest INSIDE the standard Buy mana
  // card body, above the mana image. They're only meaningful when we're
  // showing the normal payment state (success / error states swap the body
  // out entirely, naturally hiding the offer UI).
  //
  // Gate on the card's exact render predicate (incl. the `: 0` null-expiry
  // mapping): active AND (not expired OR a payment is in flight). The
  // cryptoLoading exception keeps an in-flight session visible through the
  // backend's redemption grace window, exactly as the card does — without it
  // an expired-but-active offer hides the standard buy UI while the card
  // renders nothing, leaving the page blank.
  const offerRemaining =
    effectiveNextExpiresAt != null ? effectiveNextExpiresAt - now : 0
  const showOfferCard =
    effectiveActiveCount > 0 && (offerRemaining > 0 || cryptoLoading)
  const showHiddenChip =
    !showOfferCard && offers.dismissedCount > 0 && offers.activeCount === 0

  return (
    <Col className="mx-auto w-full max-w-xl gap-4 px-4 py-6 sm:py-8">
      {/* Main Payment Card */}
      <div className="bg-canvas-0 overflow-hidden rounded-xl shadow-md">
        {/* Header */}
        <div className="border-ink-100 border-b bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 dark:from-indigo-950/30 dark:to-purple-950/30">
          <Row className="items-center justify-between gap-2">
            <h1 className="text-primary-700 text-xl font-semibold sm:text-2xl">
              Buy mana
            </h1>
            <Row className="items-center gap-1 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-sm dark:from-teal-600/80 dark:to-emerald-600/80">
              <span>$1</span>
              <ArrowRightIcon className="h-3 w-3" />
              <span>100 mana</span>
            </Row>
          </Row>
        </div>

        {/* Payment Status States */}
        {sessionState.status === 'completed' ? (
          <Col className="items-center p-6 text-center sm:p-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
              <CheckCircleIcon className="h-8 w-8 text-teal-600" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-teal-600">
              Payment Successful!
            </h2>
            <p className="text-ink-600 mb-6 text-sm">
              Your mana is being credited to your account. This may take a few
              minutes.
            </p>
            <Link href="/">
              <Button color="indigo" size="lg">
                Start Predicting
              </Button>
            </Link>
          </Col>
        ) : sessionState.status === 'error' ? (
          <Col className="items-center p-6 text-center sm:p-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <BanIcon className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-ink-900 mb-2 text-lg font-semibold">
              Payment Error
            </h2>
            <p className="text-ink-500 mb-4 text-sm">{sessionState.message}</p>
            <Button
              color="indigo"
              onClick={() => setSessionState({ status: 'idle' })}
            >
              Try Again
            </Button>
          </Col>
        ) : (
          <Col className="gap-4 p-6 sm:p-8">
            {/* Personalized mana sale — nests at the top of the buy area so
                the standard Buy mana shell stays the visual anchor; offer is
                a section ON the screen, not a replacement FOR it. Hidden
                chip takes its place when dismissed. */}
            {showOfferCard ? (
              <PersonalizedOfferCard
                now={now}
                activeCount={effectiveActiveCount}
                nextExpiresAt={effectiveNextExpiresAt}
                manaAmount={offers.manaAmount}
                priceUsdStripe={offers.priceUsdStripe}
                priceUsdCrypto={offers.priceUsdCrypto}
                cryptoLoading={cryptoLoading}
                cryptoDisabled={!canPay}
                creditCardDisabled={!canPay}
                onBuyWithCrypto={() =>
                  handleBuyManaClick(effectiveOfferId ?? undefined)
                }
                onBuyWithCreditCard={handleOfferStripe}
                onDismiss={
                  isOverrideOnly
                    ? undefined
                    : () => {
                        offers
                          .setDismissed(true)
                          .catch((e) =>
                            console.error('Failed to dismiss offer:', e)
                          )
                      }
                }
                dismissDisabled={offers.dismissPending}
              />
            ) : showHiddenChip ? (
              <HiddenOfferChip
                count={offers.dismissedCount}
                expiresAt={offers.dismissedNextExpiresAt}
                disabled={offers.dismissPending}
                onClick={() => {
                  offers
                    .setDismissed(false)
                    .catch((e) =>
                      console.error('Failed to un-dismiss offer:', e)
                    )
                }}
              />
            ) : null}

            {/* When the personalized offer is showing, hide the standard
                mana image, intro text, and big payment buttons — those are
                duplicative of what's inside the offer block. Disclaimer
                still renders below. */}
            {!showOfferCard && (
              <>
                {/* Mana Image */}
                <div className="flex justify-center">
                  <Image
                    src="/buy-mana-graphics/100k.png"
                    alt="Mana coins"
                    width={140}
                    height={140}
                    className="object-contain"
                  />
                </div>

                <p className="text-ink-600 text-center text-sm">
                  Pay with USDC from any wallet or chain, or use a credit card
                </p>

                {/* Payment Buttons */}
                <Col className="mx-auto w-full max-w-sm gap-3">
                  {!user?.id ? (
                    <button
                      disabled
                      className={clsx(
                        'relative w-full overflow-hidden rounded-xl border-2 border-transparent',
                        'cursor-not-allowed bg-gray-400',
                        'px-8 py-4 text-lg font-semibold text-white shadow-lg'
                      )}
                    >
                      <Row className="items-center justify-center gap-3">
                        <BanIcon className="h-6 w-6" />
                        <span>Loading account…</span>
                      </Row>
                    </button>
                  ) : isPurchaseBanned ? (
                    <button
                      disabled
                      className={clsx(
                        'relative w-full overflow-hidden rounded-xl border-2 border-transparent',
                        'cursor-not-allowed bg-gray-400',
                        'px-8 py-4 text-lg font-semibold text-white shadow-lg'
                      )}
                    >
                      <Row className="items-center justify-center gap-3">
                        <BanIcon className="h-6 w-6" />
                        <span>Purchases Disabled</span>
                      </Row>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleBuyManaClick()}
                        disabled={cryptoLoading}
                        className={clsx(
                          'group relative w-full overflow-hidden rounded-xl border-2 border-transparent',
                          'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%]',
                          'px-8 py-4 text-lg font-semibold text-white shadow-lg',
                          'transition-all duration-300 hover:bg-[position:100%_0] hover:shadow-xl hover:shadow-indigo-500/25',
                          'active:scale-[0.98]',
                          'disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        <Row className="items-center justify-center gap-3">
                          {sessionState.status === 'creating' ? (
                            <>
                              <LoadingIndicator
                                size="sm"
                                className="!text-white"
                              />
                              <span>Loading...</span>
                            </>
                          ) : (
                            <>
                              <CurrencyDollarIcon className="h-6 w-6 transition-transform group-hover:scale-110" />
                              <span>Buy with crypto</span>
                            </>
                          )}
                        </Row>
                      </button>

                      <button
                        onClick={() => setCreditCardModalOpen(true)}
                        className={clsx(
                          'group relative w-full overflow-hidden rounded-xl border-2',
                          'px-8 py-4 text-lg font-semibold shadow-sm transition-all duration-200',
                          'active:scale-[0.98]',
                          'bg-canvas-0 border-indigo-600 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-950/30'
                        )}
                      >
                        <Row className="items-center justify-center gap-3">
                          <FaCreditCard className="h-5 w-5 transition-transform group-hover:scale-110" />
                          <span>Buy with credit card</span>
                        </Row>
                      </button>
                    </>
                  )}
                </Col>
              </>
            )}

            {/* Legal disclaimer */}
            <div className="text-ink-600 rounded-lg bg-amber-50/50 p-4 text-sm dark:bg-amber-950/20">
              <p>
                Mana is play money and{' '}
                <strong className="text-ink-700">
                  cannot be redeemed for cash
                </strong>
                . No purchase is necessary to use the site or win prizes. You
                may wish to review your eligibility for our{' '}
                <Link
                  href="/prize"
                  className="text-primary-600 hover:text-primary-700 underline"
                >
                  prize drawings
                </Link>
                . <strong className="text-ink-700">No refunds.</strong>
              </p>
            </div>

            {/* Hide the bonus banner + rewards table when the personalized
                offer is showing — keeps the offer block as the focal point. */}
            {!showOfferCard && (
              <>
                {/* Promotional Banner */}
                {isFirstCryptoPurchase ? (
                  <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 dark:border-amber-700/50 dark:from-amber-950/30 dark:to-yellow-950/30">
                    <Row className="items-center gap-2">
                      <SparklesIcon className="h-5 w-5 text-amber-500" />
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        First Crypto Purchase Bonus: Get up to 20% extra mana!
                      </span>
                    </Row>
                    <p className="text-ink-600 mt-1 text-sm">
                      As a first-time crypto buyer, you'll receive a 10% bonus
                      on your purchase — plus an additional 10% on orders of $
                      {CRYPTO_BULK_THRESHOLD_DISPLAY.toLocaleString()} or more.
                      Bonuses apply to crypto purchases only.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 dark:border-purple-700/50 dark:from-purple-950/30 dark:to-indigo-950/30">
                    <Row className="items-center gap-2">
                      <GiftIcon className="h-5 w-5 text-purple-500" />
                      <span className="font-semibold text-purple-700 dark:text-purple-400">
                        Crypto Bulk Bonus: 10% extra on $
                        {CRYPTO_BULK_THRESHOLD_DISPLAY.toLocaleString()}+ crypto
                        purchases
                      </span>
                    </Row>
                    <p className="text-ink-600 mt-1 text-sm">
                      Purchase ${CRYPTO_BULK_THRESHOLD_DISPLAY.toLocaleString()}{' '}
                      USDC or more and receive a 10% bonus. Credit card
                      purchases are not eligible for bonuses.
                    </p>
                  </div>
                )}

                {/* Mana rewards table */}
                <ManaRewardsTable
                  isFirstCryptoPurchase={isFirstCryptoPurchase}
                />
              </>
            )}
          </Col>
        )}
      </div>

      {/* Daimo Modal - rendered when session is ready */}
      {sessionState.status === 'ready' && (
        <DaimoModal
          sessionId={sessionState.sessionId}
          clientSecret={sessionState.clientSecret}
          onPaymentCompleted={handlePaymentCompleted}
          onClose={handleModalClose}
        />
      )}

      {/* Credit Card Purchase Modal */}
      <Modal
        open={creditCardModalOpen}
        setOpen={setCreditCardModalOpen}
        size="lg"
        className={clsx(MODAL_CLASS, '!p-6 sm:!p-8')}
      >
        <Col className="w-full gap-4">
          <h2 className="text-primary-700 text-xl font-semibold sm:text-2xl">
            Buy mana with credit card
          </h2>
          <CreditCardPurchaseGrid />
        </Col>
      </Modal>
    </Col>
  )
}

export default function CheckoutPage() {
  useRedirectIfSignedOut()

  return (
    <Page trackPageView="checkout page">
      <SEO
        title="Buy mana"
        description="Buy mana to trade in your favorite questions on Manifold"
        url="/checkout"
        image="/buy-mana-graphics/100k.png"
      />

      <DaimoProviders>
        <CheckoutContent />
      </DaimoProviders>
    </Page>
  )
}
