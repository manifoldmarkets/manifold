import { useEffect, useState } from 'react'
import { Page } from '../components/layout/page'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Input } from '../components/widgets/input'
import { Button } from 'web/components/buttons/button'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { CheckoutSession, GPSData } from 'common/gidx/gidx'
import { api, APIError } from 'web/lib/api/api'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { LogoIcon } from 'web/components/icons/logo-icon'
import { TRADE_TERM } from 'common/envs/constants'
import { PaymentAmount, WebPriceInDollars } from 'common/economy'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { LocationPanel } from 'web/components/gidx/location-panel'
import { formatMoneyUSD } from 'common/util/format'
import { capitalize } from 'lodash'
import { useIosPurchases } from 'web/hooks/use-ios-purchases'
import { getVerificationStatus } from 'common/gidx/user'
import { useNativeInfo } from 'web/components/native-message-provider'
import { usePrices } from 'web/hooks/use-prices'
import { FundsSelector } from 'web/components/gidx/funds-selector'

const CheckoutPage = () => {
  const user = useUser()
  const privateUser = usePrivateUser()
  const [locationError, setLocationError] = useState<string>()
  const { isIOS } = useNativeInfo()
  const prices = usePrices()
  const [page, setPage] = useState<
    'checkout' | 'payment' | 'get-session' | 'location'
  >('checkout')
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>()
  const [dollarAmountSelected, setDollarAmountSelected] =
    useState<WebPriceInDollars>()
  const [productSelected, setProductSelected] = useState<PaymentAmount>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [showConfetti, setShowConfetti] = useState(false)
  const [loadingPrice, setLoadingPrice] = useState<WebPriceInDollars | null>(
    null
  )
  const { initiatePurchaseInDollars, loadingMessage } = useIosPurchases(
    setError,
    setLoadingPrice,
    () => setShowConfetti(true)
  )
  useEffect(() => {
    if (router.query.purchaseSuccess) {
      setShowConfetti(true)
    }
  }, [router])

  const { dollarAmount: dollarAmountFromQuery } = router.query
  useEffect(() => {
    if (!dollarAmountFromQuery) return
    if (
      !Array.isArray(dollarAmountFromQuery) &&
      prices.find((p) => p.priceInDollars === parseInt(dollarAmountFromQuery))
    ) {
      onSelectAmount(parseInt(dollarAmountFromQuery) as WebPriceInDollars)
    } else {
      console.error('Invalid dollar amount in query parameter')
      setError('Invalid dollar amount')
    }
  }, [dollarAmountFromQuery])

  const checkIfRegistered = async (
    then: 'ios-native' | 'web',
    dollarAmount: number
  ) => {
    if (!user || !privateUser) return
    setError(null)
    setLoading(true)
    if (!user.idVerified) {
      router.push('/gidx/register')
      return
    }
    const { status, message } = getVerificationStatus(user, privateUser)
    if (status !== 'error') {
      if (then === 'ios-native') {
        initiatePurchaseInDollars(dollarAmount)
      } else {
        setPage('location')
      }
    } else {
      setError(message)
      setLoading(false)
    }
  }

  const getCheckoutSession = async (DeviceGPS: GPSData) => {
    if (!dollarAmountSelected) return
    setError(null)
    setLoading(true)
    console.log('dollaramount', dollarAmountSelected)
    try {
      const res = await api('get-checkout-session-gidx', {
        DeviceGPS,
      })
      const { session, status, message } = res
      if (session && status !== 'error') {
        const product = session.PaymentAmounts.find(
          (a) => a.priceInDollars === dollarAmountSelected
        )
        if (!product) {
          setError(
            `We couldn't find that product, please ping us in discord or choose another!`
          )
          return
        }
        console.log('Got checkout session', session, product)
        setProductSelected(product)
        setCheckoutSession(session)
        setPage('payment')
      } else if (message && status === 'error') {
        setError(message)
        setLoading(false)
      }
    } catch (e) {
      console.error('Error getting checkout session', e)
      setError('Error getting checkout session')
      setLoading(false)
    }
  }

  const onSelectAmount = (dollarAmount: WebPriceInDollars) => {
    setShowConfetti(false)
    setError(null)
    setDollarAmountSelected(dollarAmount)
    setLoadingPrice(dollarAmount)
    checkIfRegistered(isIOS ? 'ios-native' : 'web', dollarAmount)
  }

  return (
    <Page className={'p-3'} trackPageView={'checkout page'} hideFooter>
      {showConfetti && <FullscreenConfetti />}
      {page === 'checkout' &&
      (isIOS ? true : !dollarAmountSelected && !dollarAmountFromQuery) ? (
        <Col>
          <FundsSelector
            onSelectPriceInDollars={onSelectAmount}
            loadingPrice={loadingPrice}
          />

          <Row className="text-error mt-2 text-sm">{locationError}</Row>
        </Col>
      ) : page === 'location' ? (
        <Col className=" mx-auto w-full max-w-lg gap-4 px-6 py-4">
          <LocationPanel
            setLocation={(data: GPSData) => {
              setPage('get-session')
              getCheckoutSession(data)
            }}
            setLocationError={setLocationError}
            setLoading={setLoading}
            loading={loading}
            locationError={locationError}
            back={() => setPage('checkout')}
          />
        </Col>
      ) : page === 'payment' &&
        checkoutSession &&
        productSelected &&
        dollarAmountSelected ? (
        <PaymentSection
          CheckoutSession={checkoutSession}
          amount={productSelected}
        />
      ) : page === 'get-session' && !error && !locationError ? (
        <Col className={'gap-3 p-4'}>
          <LoadingIndicator />
        </Col>
      ) : null}
      <Row className="text-error mt-2">{error}</Row>
      {loadingMessage && (
        <Row className="text-ink-500 mt-2 text-sm">{loadingMessage}</Row>
      )}
    </Page>
  )
}

const PaymentSection = (props: {
  CheckoutSession: CheckoutSession
  amount: PaymentAmount
}) => {
  const { CheckoutSession, amount } = props
  const { CustomerProfile, MerchantSessionID, MerchantTransactionID } =
    CheckoutSession

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(
    capitalize(CustomerProfile.Name.FirstName.toLowerCase()) +
      ' ' +
      capitalize(CustomerProfile.Name.LastName.toLowerCase())
  )
  const [cardNumber, setCardNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [address, setAddress] = useState(CustomerProfile.Address.AddressLine1)
  const [city, setCity] = useState(CustomerProfile.Address.City)
  const [state, setState] = useState(CustomerProfile.Address.StateCode)
  const [zipCode, setZipCode] = useState(CustomerProfile.Address.PostalCode)
  const [complete, setComplete] = useState(false)
  const router = useRouter()
  // Used for ads conversion tracking
  useEffect(() => {
    if (!router.query.complete && complete) {
      router.push({
        pathname: router.pathname,
        query: { ...router.query, complete: 'true' },
      })
    }
  }, [complete, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      name &&
      cardNumber &&
      expiryDate &&
      cvv &&
      address &&
      city &&
      state &&
      zipCode
    ) {
      setLoading(true)
      const res = await api('complete-checkout-session-gidx', {
        PaymentMethod: {
          Type: 'CC',
          BillingAddress: {
            AddressLine1: address,
            City: city,
            StateCode: state,
            PostalCode: zipCode,
            CountryCode: 'US',
          },
          creditCard: {
            CardNumber: cardNumber,
            CVV: cvv,
            ExpirationDate: expiryDate,
          },
          NameOnAccount: name,
          SavePaymentMethod: false,
        },
        PaymentAmount: amount,
        MerchantTransactionID,
        MerchantSessionID,
      }).catch((e) => {
        if (e instanceof APIError) {
          console.error('Error completing checkout session', e)
          return { status: 'error', message: e.message }
        }
        console.error('Error completing checkout session', e)
        return { status: 'error', message: 'Error completing checkout session' }
      })
      setLoading(false)
      if (res.status !== 'success') {
        console.error('Error completing checkout session', res.message)
        setError(res.message ?? 'Error completing checkout session')
      } else {
        console.log('Checkout session completed', res)
        setComplete(true)
      }
    }
  }

  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value
    if (value.length > 5) {
      return
    }
    const isBackspace =
      (e.nativeEvent as InputEvent)?.inputType === 'deleteContentBackward'
    if (value.length === 2 && !value.includes('/') && !isBackspace) {
      value += '/'
    } else if (value.length === 3 && !isBackspace && !value.includes('/')) {
      value = value.slice(0, 2) + '/' + value.slice(2)
    } else if (value.includes('/') && value.split('/').length > 2) {
      return
    }
    setExpiryDate(value)
  }

  if (complete) {
    return (
      <Col className={'gap-4'}>
        <FullscreenConfetti />
        <Row className="text-primary-700 text-2xl">Purchase Complete</Row>
        <Col className="text-ink-700 w-full items-center justify-center">
          <Image
            src="/manachan.png"
            width={300}
            height={300}
            alt={'Manachan'}
            className={'rounded-full'}
          />
          <span className={'italic'}>
            May the {TRADE_TERM}s be ever in your favor.
          </span>
          - Manachan
        </Col>
      </Col>
    )
  }

  return (
    <Col className={'-m-3'}>
      <Col className="min-h-screen items-center justify-center">
        <Row className={'w-full justify-center'}>
          <LogoIcon
            className="h-40 w-40 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
            aria-hidden
          />
        </Row>
        <Row className={'my-2 justify-center text-lg'}>
          <span>
            <CoinNumber
              className={'font-semibold'}
              amount={amount.mana}
              isInline
            />{' '}
            {amount.bonusInDollars ? (
              <>
                +{' '}
                <CoinNumber
                  className={'font-semibold'}
                  coinType={'sweepies'}
                  amount={amount.bonusInDollars}
                  isInline
                />
              </>
            ) : null}
          </span>
        </Row>
        <Row className={'my-4 justify-center text-4xl '}>
          <span>{formatMoneyUSD(amount.priceInDollars, true)}</span>
        </Row>
        <Col className="bg-canvas-0 w-full max-w-md rounded p-4">
          <form onSubmit={handleSubmit}>
            <Col className="space-y-4">
              <Input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Row className={'relative w-full'}>
                <Input
                  type="text"
                  className={'w-full'}
                  placeholder="1234 1234 1234 1234"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                />
                <Row className={'absolute right-1 top-4 gap-0.5'}>
                  <Image
                    height={15}
                    width={30}
                    src={'/payment-icons/dark/1.png'}
                    alt={'visa'}
                  />
                  <Image
                    height={15}
                    width={30}
                    src={'/payment-icons/dark/2.png'}
                    alt={'mastercard'}
                  />
                  <Image
                    height={15}
                    width={30}
                    src={'/payment-icons/dark/14.png'}
                    alt={'discover'}
                  />{' '}
                  <Image
                    height={15}
                    width={30}
                    src={'/payment-icons/dark/22.png'}
                    alt={'amex'}
                  />
                </Row>
              </Row>

              <Row className="space-x-4">
                <Input
                  type="text"
                  placeholder="MM/YY"
                  value={expiryDate}
                  onChange={handleExpiryDateChange}
                  className="w-1/2"
                />
                <Input
                  type="text"
                  placeholder="CVV"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  className="w-1/2"
                />
              </Row>
              <Input
                type="text"
                placeholder="Billing Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <Row className="space-x-4">
                <Input
                  type="text"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-1/2"
                />
                <Input
                  type="text"
                  placeholder="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-1/4"
                />
                <Input
                  type="text"
                  placeholder="ZIP"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className="w-1/4"
                />
              </Row>
              {error && <span className={'text-error'}>{error}</span>}
              <Button
                type="submit"
                color="indigo"
                size="lg"
                loading={loading}
                disabled={
                  !name ||
                  !cardNumber ||
                  !expiryDate ||
                  !cvv ||
                  !address ||
                  !city ||
                  !state ||
                  !zipCode ||
                  loading
                }
              >
                Complete purchase
              </Button>
            </Col>
          </form>
        </Col>
      </Col>
    </Col>
  )
}

export default CheckoutPage
