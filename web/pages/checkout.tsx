import { useEffect, useState } from 'react'
import { Page } from '../components/layout/page'
import { Card } from '../components/widgets/card'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { Input } from '../components/widgets/input'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { getIsNative } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { CheckoutSession, GPSData, PaymentAmount } from 'common/gidx/gidx'
import { formatMoney, formatWithCommas } from 'common/util/format'
import { getNativePlatform } from 'web/lib/native/is-native'
import { IOS_PRICES, WEB_PRICES } from 'web/pages/add-funds'
import { api, validateIapReceipt } from 'web/lib/api/api'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'
import { AlertBox } from 'web/components/widgets/alert-box'
import {
  FundsSelector,
  use24hrUsdPurchases,
} from 'web/components/add-funds-modal'
import router from 'next/router'
import { LocationPanel } from 'web/components/gidx/register-user-form'
import { getVerificationStatus } from 'common/user'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'

const CheckoutPage = () => {
  const user = useUser()
  const [locationError, setLocationError] = useState<string | null>(null)
  const { isNative, platform } = getNativePlatform()
  const prices = isNative && platform === 'ios' ? IOS_PRICES : WEB_PRICES
  const [page, setPage] = useState<'checkout' | 'payment' | 'location'>(
    'checkout'
  )
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>()
  const [amountSelected, setAmountSelected] = useState<number>(
    prices[formatMoney(25000)]
  )
  const [productSelected, setProductSelected] = useState<PaymentAmount>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [DeviceGPS, setDeviceGPS] = usePersistentInMemoryState<
    GPSData | undefined
  >(undefined, 'gidx-checkout-location-user-info')
  const goHome = () => {
    router.push('/home')
  }

  const checkIfRegistered = async (then: 'ios-native' | 'web') => {
    // if user is not registered, they must register first
    if (!user) return
    setError(null)
    setLoading(true)
    if (getVerificationStatus(user).status !== 'error') {
      if (then === 'ios-native') {
        postMessageToNative('checkout', { amount: amountSelected })
      } else {
        await checkLocationPermission()
      }
    } else {
      // TODO: implement the redirect from the register page
      router.push('/gidx/register?r=checkout')
    }
  }

  useNativeMessages(['location'], (type, data) => {
    console.log('Received location data from native', data)
    if ('error' in data) {
      setLocationError(data.error)
      setLoading(false)
    } else {
      setDeviceGPS(data)
      setLoading(false)
    }
  })

  const requestLocationBrowser = () => {
    setLocationError(null)
    setLoading(true)
    if (getIsNative()) {
      console.log('requesting location from native')
      postMessageToNative('locationRequested', {})
      return
    }
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { coords } = position
          setDeviceGPS({
            Latitude: coords.latitude,
            Longitude: coords.longitude,
            Radius: coords.accuracy,
            Altitude: coords.altitude ?? 0,
            Speed: coords.speed ?? 0,
            DateTime: new Date().toISOString(),
          })
          setLoading(false)
          setPage('payment')
        },
        (error) => {
          setLocationError(error.message)
          setLoading(false)
        }
      )
    } else {
      setLocationError('Geolocation is not supported by your browser.')
      setLoading(false)
    }
  }

  const checkLocationPermission = async () => {
    setLoading(true)
    if ('permissions' in navigator) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: 'geolocation',
        })

        switch (permissionStatus.state) {
          case 'granted':
            console.log('Permission already granted')
            requestLocationBrowser()
            break
          case 'prompt':
            console.log('Permission has not been requested yet')
            setPage('location')
            setLoading(false)
            break
          case 'denied':
            console.log('Permission has been denied')
            setPage('location')
            setLoading(false)
            break
        }

        // Listen for changes to the permission state
        permissionStatus.onchange = () => {
          console.log(
            'Geolocation permission state has changed to:',
            permissionStatus.state
          )
        }
      } catch (error) {
        console.error('Error checking geolocation permission:', error)
        requestLocationBrowser()
      }
    } else {
      console.log('Permissions API not supported')
      // Fallback to your original method
      requestLocationBrowser()
    }
  }

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
  const getCheckoutSession = async () => {
    if (!DeviceGPS || !amountSelected) return
    setError(null)
    setLoading(true)
    try {
      const res = await api('get-checkout-session-gidx', {
        DeviceGPS,
      })
      const { session, status, message } = res
      if (session) {
        const product = session.PaymentAmounts.find(
          (a) => a.PaymentAmount === amountSelected
        )
        if (!product) {
          setError(
            `We couldn't find that product, please ping us in discord or choose another!`
          )
        }
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
  useEffect(() => {
    getCheckoutSession()
  }, [DeviceGPS, amountSelected])

  return (
    <Page trackPageView={'checkout page'}>
      {page === 'checkout' && (
        <Col>
          <div className="mb-4">
            Buy <ManaCoin /> mana to trade in your favorite questions.
          </div>

          <div className="text-ink-500 mb-2 text-sm">Amount</div>
          <FundsSelector
            fundAmounts={prices}
            selected={amountSelected}
            onSelect={setAmountSelected}
          />

          <div className="mt-6">
            <div className="text-ink-500 mb-1 text-sm">Price USD</div>
            <div className="text-xl">${amountSelected / 100}</div>
          </div>

          {pastLimit && (
            <AlertBox title="Purchase limit" className="my-4">
              You have reached your daily purchase limit. Please try again
              tomorrow.
            </AlertBox>
          )}

          <div className="mt-2 flex gap-2">
            <Button
              color={'gradient'}
              loading={loading}
              disabled={pastLimit}
              onClick={() =>
                checkIfRegistered(
                  isNative && platform === 'ios' ? 'ios-native' : 'web'
                )
              }
            >
              Continue
            </Button>
          </div>
          <Row className="text-error mt-2 text-sm">{locationError}</Row>
        </Col>
      )}
      {page === 'location' && (
        <LocationPanel
          requestLocation={requestLocationBrowser}
          locationError={locationError}
          loading={loading}
          back={() => setPage('checkout')}
        />
      )}
      {page === 'payment' && checkoutSession && productSelected && (
        <PaymentSection
          CheckoutSession={checkoutSession}
          amountSelected={productSelected}
        />
      )}
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </Page>
  )
}

// TODO parse payment options and bonuses add complete-checkout=-gidx
const PaymentSection = (props: {
  CheckoutSession: CheckoutSession
  amountSelected: PaymentAmount
}) => {
  const { CheckoutSession, amountSelected } = props
  const [paymentType, setPaymentType] = useState<'credit-card' | 'apple-pay'>(
    'credit-card'
  )
  const [name, setName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission logic here
    console.log('Form submitted', {
      paymentType,
      name,
      cardNumber,
      expiryDate,
      cvv,
      address,
      city,
      state,
      zipCode,
    })
  }

  const renderStep1 = () => (
    <Col className="space-y-4">
      <h2 className="text-xl font-semibold">Select Payment Method</h2>
      <Button color={'indigo'} onClick={() => setPaymentType('credit-card')}>
        Credit Card
      </Button>
      <Button color={'purple'} onClick={() => setPaymentType('apple-pay')}>
        Apple Pay
      </Button>
    </Col>
  )
  const handleSubmit = (e: React.FormEvent) => {
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
      // Handle form submission logic here
      console.log('Form submitted', {
        name,
        cardNumber,
        expiryDate,
        cvv,
        address,
        city,
        state,
        zipCode,
      })
    }
  }

  return (
    <Col>
      <Col className="min-h-screen items-center justify-center py-12">
        <Card className="w-full max-w-md p-8">
          <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
          <Row className={'justify-between'}>
            Cost:
            <span>${formatWithCommas(amountSelected.PaymentAmount)}</span>
          </Row>

          <Row className={'justify-between'}>
            To receive:
            <span>
              <CoinNumber amount={amountSelected.PaymentAmount} isInline /> &{' '}
              {/*// TODO: are we going to use bonus amount? Not sure how this will work yet*/}
              <CoinNumber
                isSpice
                amount={amountSelected.BonusAmount}
                isInline
              />
            </span>
          </Row>

          <form onSubmit={handleSubmit}>
            <Col className="space-y-4">
              <Input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                type="text"
                placeholder="Card Number"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
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
              <Button
                type="submit"
                color="indigo"
                size="lg"
                disabled={
                  !name ||
                  !cardNumber ||
                  !expiryDate ||
                  !cvv ||
                  !address ||
                  !city ||
                  !state ||
                  !zipCode
                }
              >
                Complete Purchase
              </Button>
            </Col>
          </form>
        </Card>
      </Col>
    </Col>
  )
}

export default CheckoutPage
