'use client'
import { DaimoPayButton } from '@daimo/pay'
import { baseUSDC } from '@daimo/pay-common'
import { getAddress, type Address } from 'viem'

import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import {
  CryptoProviders,
  useCryptoReady,
} from 'web/components/crypto/crypto-providers'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Button } from 'web/components/buttons/button'

// Hot wallet address for receiving crypto payments
// This should be set in the environment/secrets
const HOT_WALLET_ADDRESS: Address = (process.env
  .NEXT_PUBLIC_DAIMO_HOT_WALLET_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address

function CheckoutContent() {
  const user = useUser()
  const cryptoReady = useCryptoReady()
  const [paymentStatus, setPaymentStatus] = useState<
    'idle' | 'started' | 'completed' | 'error'
  >('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePaymentStarted = () => {
    setPaymentStatus('started')
    setErrorMessage(null)
  }

  const handlePaymentCompleted = (payment: { [key: string]: unknown }) => {
    setPaymentStatus('completed')
    console.log('Payment completed:', payment)
  }

  return (
    <Col className="bg-canvas-0 mx-auto max-w-[700px] rounded p-4 py-8 sm:p-8 sm:shadow-md">
      <Title>Buy Mana with Crypto</Title>

      <div className="text-ink-700 mb-6">
        <p className="mb-2">
          Deposit USDC from any supported chain to purchase mana. Your payment
          will be converted at a rate of <strong>100 mana per $1 USDC</strong>.
        </p>
        <p className="text-ink-500 text-sm">
          Payments settle on Base. You can pay from Ethereum, Arbitrum,
          Optimism, Polygon, and other supported networks.
        </p>
      </div>

      {paymentStatus === 'completed' ? (
        <div className="bg-primary-50 text-primary-700 rounded-lg p-4 text-center">
          <p className="font-semibold">Payment successful!</p>
          <p className="text-sm">
            Your mana will be credited to your account shortly.
          </p>
        </div>
      ) : !cryptoReady ? (
        <Row className="justify-center py-4">
          <LoadingIndicator />
        </Row>
      ) : (
        <Row className="justify-center">
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
              <Button color="indigo" size="xl" onClick={show}>
                Buy mana
              </Button>
            )}
          </DaimoPayButton.Custom>
        </Row>
      )}

      {paymentStatus === 'started' && (
        <p className="text-ink-500 mt-4 text-center text-sm">
          Processing your payment...
        </p>
      )}

      {errorMessage && (
        <p className="text-error mt-4 text-center text-sm">{errorMessage}</p>
      )}

      <div className="text-ink-500 mt-8 border-t pt-4 text-sm">
        <p className="font-semibold">How it works:</p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Click the button above to open the payment modal</li>
          <li>Choose your payment method (wallet, exchange, etc.)</li>
          <li>Enter the amount of USDC you want to deposit</li>
          <li>Complete the payment from any supported chain</li>
          <li>Your mana will be credited automatically</li>
        </ol>
      </div>
    </Col>
  )
}

export default function CheckoutPage() {
  useRedirectIfSignedOut()

  return (
    <Page trackPageView="checkout page">
      <SEO
        title="Buy Mana with Crypto"
        description="Purchase mana using cryptocurrency on Manifold"
        url="/checkout"
      />

      <CryptoProviders>
        <CheckoutContent />
      </CryptoProviders>
    </Page>
  )
}
