'use client'
import { DaimoModal } from '@daimo/sdk/web'
import clsx from 'clsx'

import { isUserBanned } from 'common/ban-utils'
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
import {
  CurrencyDollarIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  GiftIcon,
  BanIcon,
} from '@heroicons/react/solid'
import Image from 'next/image'
import Link from 'next/link'
import { CRYPTO_BULK_THRESHOLD_DISPLAY } from 'common/economy'
import { api } from 'web/lib/api/api'

type SessionState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'ready'; sessionId: string; clientSecret: string }
  | { status: 'completed' }
  | { status: 'error'; message: string }

function CheckoutContent() {
  const user = useUser()
  const [sessionState, setSessionState] = useState<SessionState>({
    status: 'idle',
  })

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
          <Row className="items-center justify-between">
            <h1 className="text-primary-700 text-xl font-semibold sm:text-2xl">
              Buy mana
            </h1>
            <Row className="items-center gap-1 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-sm dark:from-teal-600/80 dark:to-emerald-600/80">
              <span>$1 USDC</span>
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
              Pay with USDC from any wallet or chain
            </p>

            {/* Payment Button */}
            <Col className="items-center gap-4">
              {!user?.id ? (
                <button
                  disabled
                  className={clsx(
                    'relative w-full max-w-sm overflow-hidden rounded-xl',
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
                    'relative w-full max-w-sm overflow-hidden rounded-xl',
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
                <button
                  onClick={handleBuyManaClick}
                  disabled={
                    sessionState.status === 'creating' ||
                    sessionState.status === 'ready'
                  }
                  className={clsx(
                    'group relative w-full max-w-sm overflow-hidden rounded-xl',
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
                        <span>Buy mana</span>
                      </>
                    )}
                  </Row>
                </button>
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
                    First Purchase Bonus: Get up to 20% extra mana!
                  </span>
                </Row>
                <p className="text-ink-600 mt-1 text-sm">
                  As a first-time crypto buyer, you'll receive a 10% bonus on
                  your purchase — plus an additional 10% on orders of $
                  {CRYPTO_BULK_THRESHOLD_DISPLAY.toLocaleString()} or more!
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 dark:border-purple-700/50 dark:from-purple-950/30 dark:to-indigo-950/30">
                <Row className="items-center gap-2">
                  <GiftIcon className="h-5 w-5 text-purple-500" />
                  <span className="font-semibold text-purple-700 dark:text-purple-400">
                    Bulk Bonus: 10% extra on $
                    {CRYPTO_BULK_THRESHOLD_DISPLAY.toLocaleString()}+ purchases
                  </span>
                </Row>
                <p className="text-ink-600 mt-1 text-sm">
                  Purchase ${CRYPTO_BULK_THRESHOLD_DISPLAY.toLocaleString()}{' '}
                  USDC or more and receive a 10% bonus.
                </p>
              </div>
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
