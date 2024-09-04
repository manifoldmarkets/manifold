import { useEffect, useState } from 'react'
import { Page } from '../components/layout/page'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Input } from '../components/widgets/input'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { postMessageToNative } from 'web/lib/native/post-message'
import { CheckoutSession, GPSData } from 'common/gidx/gidx'
import { getNativePlatform } from 'web/lib/native/is-native'
import { api, validateIapReceipt } from 'web/lib/api/api'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'
import { AlertBox } from 'web/components/widgets/alert-box'
import { PriceTile, use24hrUsdPurchases } from 'web/components/add-funds-modal'
import { getVerificationStatus } from 'common/user'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'
import { LogoIcon } from 'web/components/icons/logo-icon'
import { FaStore } from 'react-icons/fa6'
import clsx from 'clsx'
import { TRADE_TERM, TWOMBA_ENABLED } from 'common/envs/constants'
import {
  IOS_PRICES,
  WebManaAmounts,
  MANA_WEB_PRICES,
  PaymentAmount,
} from 'common/economy'
import { FullscreenConfetti } from 'web/components/widgets/fullscreen-confetti'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { LocationPanel } from 'web/components/gidx/location-panel'
import { formatSweepsToUSD } from 'common/util/format'
import { capitalize } from 'lodash'

const CheckoutPage = () => {
  const user = useUser()
  const [locationError, setLocationError] = useState<string>()
  const { isNative, platform } = getNativePlatform()
  const prices = isNative && platform === 'ios' ? IOS_PRICES : MANA_WEB_PRICES
  const [page, setPage] = useState<
    'checkout' | 'payment' | 'get-session' | 'location'
  >('checkout')
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>()
  const [amountSelected, setAmountSelected] = useState<WebManaAmounts>()
  const [productSelected, setProductSelected] = useState<PaymentAmount>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const router = useRouter()
  // get query params
  const { manaAmount } = router.query
  useEffect(() => {
    if (!manaAmount) return
    if (
      !Array.isArray(manaAmount) &&
      prices.find((p) => p.mana === parseInt(manaAmount))
    ) {
      onSelectAmount(parseInt(manaAmount) as WebManaAmounts)
    } else {
      console.error('Invalid mana amount in query parameter')
      setError('Invalid mana amount')
    }
  }, [manaAmount])

  const goHome = () => {
    router.push('/home')
  }

  const checkIfRegistered = async (then: 'ios-native' | 'web') => {
    // if user is not registered, they must register first
    if (!user) return
    setError(undefined)
    setLoading(true)
    if (getVerificationStatus(user).status !== 'error') {
      if (then === 'ios-native') {
        postMessageToNative('checkout', { amount: amountSelected })
      } else {
        setPage('location')
      }
    } else {
      router.push('/gidx/register?redirect=checkout')
    }
  }

  // TODO: need to test if this works on ios
  const handleIapReceipt = async <T extends nativeToWebMessageType>(
    type: T,
    data: MesageTypeMap[T]
  ) => {
    if (type === 'iapReceipt') {
      const { receipt } = data as MesageTypeMap['iapReceipt']
      try {
        await validateIapReceipt({ receipt: receipt })
        console.log('iap receipt validated')
        goHome()
      } catch (e) {
        console.log('iap receipt validation error', e)
        setError('Error validating receipt')
      }
    } else if (type === 'iapError') {
      setError('Error during purchase! Try again.')
    }
    setLoading(false)
  }
  useNativeMessages(['iapReceipt', 'iapError'], handleIapReceipt)

  const totalPurchased = use24hrUsdPurchases(user?.id || '')
  const pastLimit = totalPurchased >= 2500
  const getCheckoutSession = async (DeviceGPS: GPSData) => {
    if (!amountSelected) return
    setError(undefined)
    setLoading(true)
    const dollarAmount = (prices as typeof MANA_WEB_PRICES).find(
      (a) => a.mana === amountSelected
    )?.price
    console.log('dollaramount', dollarAmount)
    if (!dollarAmount) {
      setError('Invalid mana amount')
      setLoading(false)
      return
    }
    try {
      const res = await api('get-checkout-session-gidx', {
        DeviceGPS,
      })
      const { session, status, message } = res
      if (session && status !== 'error') {
        const product = session.PaymentAmounts.find(
          (a) => a.price === dollarAmount
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

  const onSelectAmount = (amount: WebManaAmounts) => {
    setAmountSelected(amount)
    checkIfRegistered(isNative && platform === 'ios' ? 'ios-native' : 'web')
  }

  return (
    <Page className={'p-3'} trackPageView={'checkout page'}>
      {page === 'checkout' && !amountSelected && !manaAmount ? (
        <Col>
          <FundsSelector prices={prices} onSelect={onSelectAmount} />

          {pastLimit && (
            <AlertBox title="Purchase limit" className="my-4">
              You have reached your daily purchase limit. Please try again
              tomorrow.
            </AlertBox>
          )}

          <Row className="text-error mt-2 text-sm">{locationError}</Row>
        </Col>
      ) : page === 'location' ? (
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
      ) : page === 'payment' &&
        checkoutSession &&
        productSelected &&
        amountSelected ? (
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
    </Page>
  )
}

function FundsSelector(props: {
  prices: PaymentAmount[]
  onSelect: (amount: WebManaAmounts) => void
}) {
  const { onSelect, prices } = props
  const user = useUser()
  const { isNative, platform } = getNativePlatform()
  const [loading, setLoading] = useState<WebManaAmounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const handleIapReceipt = async <T extends nativeToWebMessageType>(
    type: T,
    data: MesageTypeMap[T]
  ) => {
    if (type === 'iapReceipt') {
      const { receipt } = data as MesageTypeMap['iapReceipt']
      try {
        await validateIapReceipt({ receipt: receipt })
        console.log('iap receipt validated')
      } catch (e) {
        console.log('iap receipt validation error', e)
        setError('Error validating receipt')
      }
    } else if (type === 'iapError') {
      setError('Error during purchase! Try again.')
    }
    setLoading(null)
  }
  useNativeMessages(['iapReceipt', 'iapError'], handleIapReceipt)

  const totalPurchased = use24hrUsdPurchases(user?.id || '')
  const pastLimit = totalPurchased >= 2500

  return (
    <>
      <Row className="mb-2 items-center gap-1 text-2xl font-semibold">
        <FaStore className="h-6 w-6" />
        Mana Shop
      </Row>
      <div
        className={clsx(
          'text-ink-700 text-sm',
          TWOMBA_ENABLED ? 'mb-5' : 'mb-4'
        )}
      >
        {TWOMBA_ENABLED ? (
          <span>
            Buy mana to trade in your favorite questions. Always free to play,
            no purchase necessary.
          </span>
        ) : (
          <span>Buy mana to trade in your favorite questions.</span>
        )}
      </div>

      {pastLimit && (
        <AlertBox title="Purchase limit" className="my-4">
          You have reached your daily purchase limit. Please try again tomorrow.
        </AlertBox>
      )}

      <div className="grid grid-cols-2 gap-4 gap-y-6">
        {prices.map((amounts) => {
          return isNative && platform === 'ios' ? (
            <PriceTile
              key={`ios-${amounts.mana}`}
              amounts={amounts}
              loading={loading}
              disabled={pastLimit}
              onClick={() => {
                setError(null)
                setLoading(amounts.mana)
                postMessageToNative('checkout', { amount: amounts.price })
              }}
            />
          ) : (
            <PriceTile
              key={`web-${amounts.mana}`}
              amounts={amounts}
              loading={loading}
              disabled={pastLimit}
              onClick={() => {
                setError(null)
                setLoading(amounts.mana)
                onSelect(amounts.mana)
              }}
            />
          )
        })}
      </div>
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </>
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
  if (complete) {
    return (
      <Col className={'gap-4'}>
        <FullscreenConfetti />
        <Row className="text-2xl text-indigo-700">Purchase Complete</Row>
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
            +{' '}
            <CoinNumber
              className={'font-semibold'}
              coinType={'sweepies'}
              amount={amount.bonus}
              isInline
            />
          </span>
        </Row>
        <Row className={'my-4 justify-center text-4xl '}>
          <span>{formatSweepsToUSD(amount.price)}</span>
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
                  onChange={(e) => setExpiryDate(e.target.value)}
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
