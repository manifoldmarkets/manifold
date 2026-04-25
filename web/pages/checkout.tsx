'use client'
import { DaimoModal } from '@daimo/sdk/web'
import clsx from 'clsx'

import { isUserBanned } from 'common/ban-utils'
import { canReceiveBonuses } from 'common/user'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { DaimoProviders } from 'web/components/crypto/crypto-providers'
import { SEO } from 'web/components/SEO'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Button } from 'web/components/buttons/button'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Tooltip } from 'web/components/widgets/tooltip'
import { PriceTile } from 'web/components/add-funds-modal'
import { VerificationRequiredModal } from 'web/components/modals/verification-required-modal'
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
  | { status: 'ready'; sessionId: string; clientSecret: string }
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
  const [verificationModalOpen, setVerificationModalOpen] = useState(false)

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
  const isBonusEligible = !!user && canReceiveBonuses(user)
  const canUseCreditCard = canPay && isBonusEligible

  const handleBuyManaClick = async () => {
    if (!canPay) return

    setSessionState({ status: 'creating' })

    try {
      const result = await api('create-daimo-session', {})
      setSessionState({
        status: 'ready',
        sessionId: result.sessionId,
        clientSecret: result.clientSecret,
      })
    } catch (e) {
      console.error('Failed to create Daimo session:', e)
      setSessionState({
        status: 'error',
        message: 'Failed to start payment. Please try again.',
      })
    }
  }

  const handlePaymentCompleted = () => {
    setSessionState({ status: 'completed' })
  }

  const handleModalClose = () => {
    if (sessionState.status === 'ready') {
      setSessionState({ status: 'idle' })
    }
  }

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
                    onClick={handleBuyManaClick}
                    disabled={
                      sessionState.status === 'creating' ||
                      sessionState.status === 'ready'
                    }
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
                          <LoadingIndicator size="sm" className="!text-white" />
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

                  <Tooltip
                    text={
                      canUseCreditCard
                        ? null
                        : 'Verify your identity to enable credit card purchases.'
                    }
                    placement="bottom"
                    className="block w-full"
                  >
                    <button
                      onClick={() => {
                        if (canUseCreditCard) {
                          setCreditCardModalOpen(true)
                        } else {
                          setVerificationModalOpen(true)
                        }
                      }}
                      className={clsx(
                        'group relative w-full overflow-hidden rounded-xl border-2',
                        'px-8 py-4 text-lg font-semibold shadow-sm transition-all duration-200',
                        'active:scale-[0.98]',
                        canUseCreditCard
                          ? 'border-indigo-600 bg-canvas-0 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-950/30'
                          : 'border-ink-300 bg-canvas-50 text-ink-500 dark:bg-canvas-100'
                      )}
                    >
                      <Row className="items-center justify-center gap-3">
                        <FaCreditCard className="h-5 w-5 transition-transform group-hover:scale-110" />
                        <span>Buy with credit card</span>
                      </Row>
                    </button>
                  </Tooltip>
                </>
              )}
            </Col>

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
                  As a first-time crypto buyer, you'll receive a 10% bonus on
                  your purchase — plus an additional 10% on orders of $
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
                  USDC or more and receive a 10% bonus. Credit card purchases
                  are not eligible for bonuses.
                </p>
              </div>
            )}

            {/* Mana rewards table */}
            <ManaRewardsTable isFirstCryptoPurchase={isFirstCryptoPurchase} />
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

      {/* Verification Required Modal */}
      {user && verificationModalOpen && (
        <VerificationRequiredModal
          open={verificationModalOpen}
          setOpen={setVerificationModalOpen}
          user={user}
          action="buy mana with a credit card"
        />
      )}
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
