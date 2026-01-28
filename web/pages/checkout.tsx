'use client'
import { DaimoPayButton } from '@daimo/pay'
import { baseUSDC } from '@daimo/pay-common'
import { getAddress, type Address } from 'viem'
import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import {
  CryptoProviders,
  useCryptoReady,
} from 'web/components/crypto/crypto-providers'
import { SEO } from 'web/components/SEO'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Button } from 'web/components/buttons/button'
import {
  CurrencyDollarIcon,
  ShieldCheckIcon,
  LightningBoltIcon,
  CheckCircleIcon,
} from '@heroicons/react/solid'
import Link from 'next/link'

// Hot wallet address for receiving crypto payments
const HOT_WALLET_ADDRESS: Address = (process.env
  .NEXT_PUBLIC_DAIMO_HOT_WALLET_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address

function CheckoutContent() {
  const user = useUser()
  const cryptoReady = useCryptoReady()
  const [paymentStatus, setPaymentStatus] = useState<
    'idle' | 'started' | 'completed' | 'error'
  >('idle')

  const handlePaymentStarted = () => {
    setPaymentStatus('started')
  }

  const handlePaymentCompleted = (payment: { [key: string]: unknown }) => {
    setPaymentStatus('completed')
    console.log('Payment completed:', payment)
  }

  return (
    <Col className="mx-auto w-full max-w-xl gap-4 px-4 py-6 sm:py-8">
      {/* Main Payment Card */}
      <div className="bg-canvas-0 overflow-hidden rounded-xl shadow-md">
        {/* Header */}
        <div className="border-ink-100 border-b bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 dark:from-indigo-950/30 dark:to-purple-950/30">
          <h1 className="text-primary-700 text-xl font-semibold sm:text-2xl">
            Buy Mana
          </h1>
        </div>

        {/* Payment Status States */}
        {paymentStatus === 'completed' ? (
          <Col className="items-center p-6 text-center sm:p-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
              <CheckCircleIcon className="h-8 w-8 text-teal-600" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-teal-600">
              Payment Successful!
            </h2>
            <p className="text-ink-600 mb-6 text-sm">
              Your mana is being credited to your account. This usually takes
              just a few seconds.
            </p>
            <Link href="/">
              <Button color="indigo" size="lg">
                Start Predicting
              </Button>
            </Link>
          </Col>
        ) : paymentStatus === 'started' ? (
          <Col className="items-center p-6 text-center sm:p-8">
            <div className="mb-4">
              <LoadingIndicator size="lg" />
            </div>
            <h2 className="text-ink-900 mb-2 text-lg font-semibold">
              Processing Payment
            </h2>
            <p className="text-ink-500 text-sm">
              Please complete the payment in the popup window...
            </p>
          </Col>
        ) : !cryptoReady ? (
          <div className="flex items-center justify-center p-12">
            <LoadingIndicator />
          </div>
        ) : (
          <Col className="gap-5 p-6 sm:p-8">
            {/* Legal disclaimer */}
            <div className="text-ink-600 rounded-lg bg-amber-50/50 p-4 text-sm dark:bg-amber-950/20">
              <p className="mb-2">
                Mana is Manifold's play money and{' '}
                <strong className="text-ink-700">
                  cannot be redeemed for cash
                </strong>
                . No purchase is necessary to use or win prizes on the platform.
                You may wish to review your eligibility for our{' '}
                <Link
                  href="/prize"
                  className="text-primary-600 hover:text-primary-700 underline"
                >
                  prize drawings
                </Link>
                . Send USDC to purchase mana using the button below.{' '}
                <strong className="text-ink-700">No refunds.</strong>
              </p>
              <p className="text-ink-500">
                Purchase rate:{' '}
                <span className="font-semibold text-teal-600">
                  100 mana per 1 USDC
                </span>
              </p>
            </div>

            {/* Payment Button */}
            <Col className="items-center gap-4">
              <DaimoPayButton.Custom
                appId="pay-manifoldmarkets-C5iZ9eKA8sFTUanLHufQZj"
                toAddress={HOT_WALLET_ADDRESS}
                toChain={baseUSDC.chainId}
                toToken={getAddress(baseUSDC.token)}
                refundAddress={HOT_WALLET_ADDRESS}
                onPaymentStarted={handlePaymentStarted}
                onPaymentCompleted={handlePaymentCompleted}
                metadata={{
                  userId: user?.id ?? '',
                }}
              >
                {({ show }) => (
                  <button
                    onClick={show}
                    className={clsx(
                      'group relative w-full max-w-sm overflow-hidden rounded-xl',
                      'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%]',
                      'px-8 py-4 text-lg font-semibold text-white shadow-lg',
                      'transition-all duration-300 hover:bg-[position:100%_0] hover:shadow-xl hover:shadow-indigo-500/25',
                      'active:scale-[0.98]'
                    )}
                  >
                    <Row className="items-center justify-center gap-3">
                      <CurrencyDollarIcon className="h-6 w-6 transition-transform group-hover:scale-110" />
                      <span>Buy Mana with Crypto</span>
                    </Row>
                  </button>
                )}
              </DaimoPayButton.Custom>

              {/* Trust indicators */}
              <Row className="text-ink-400 flex-wrap justify-center gap-x-5 gap-y-1 text-xs">
                <Row className="items-center gap-1">
                  <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Secure</span>
                </Row>
                <Row className="items-center gap-1">
                  <LightningBoltIcon className="h-3.5 w-3.5 text-amber-500" />
                  <span>Instant</span>
                </Row>
                <Row className="items-center gap-1">
                  <CheckCircleIcon className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Any Chain</span>
                </Row>
              </Row>
            </Col>
          </Col>
        )}
      </div>

      {/* How It Works Section */}
      <div className="bg-canvas-0 rounded-xl p-5 shadow-sm sm:p-6">
        <h2 className="text-ink-700 mb-4 text-sm font-semibold uppercase tracking-wide">
          How it works
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              step: '1',
              title: 'Click the button',
              description: 'Open the secure payment modal',
            },
            {
              step: '2',
              title: 'Choose your amount',
              description: 'Enter how much USDC to deposit',
            },
            {
              step: '3',
              title: 'Pay from any chain',
              description: 'Use your wallet, exchange, or card',
            },
            {
              step: '4',
              title: 'Get mana instantly',
              description: 'Credited to your account automatically',
            },
          ].map((item) => (
            <Row key={item.step} className="items-start gap-3">
              <div className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-white flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {item.step}
              </div>
              <Col className="gap-0">
                <span className="text-ink-800 text-sm font-medium">
                  {item.title}
                </span>
                <span className="text-ink-500 text-xs">{item.description}</span>
              </Col>
            </Row>
          ))}
        </div>
      </div>
    </Col>
  )
}

export default function CheckoutPage() {
  useRedirectIfSignedOut()

  return (
    <Page trackPageView="checkout page">
      <SEO
        title="Buy Mana"
        description="Purchase mana using cryptocurrency on Manifold"
        url="/checkout"
      />

      <CryptoProviders>
        <CheckoutContent />
      </CryptoProviders>
    </Page>
  )
}
