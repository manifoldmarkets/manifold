import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Page } from '../components/layout/page'
import { Col } from '../components/layout/col'
import { Row } from '../components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { LocationPanel } from 'web/components/gidx/location-panel'
import { CheckoutSession, GPSData } from 'common/gidx/gidx'
import { getVerificationStatus } from 'common/user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Input } from 'web/components/widgets/input'
import { Button } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'

const CashoutPage = () => {
  const user = useUser()
  const router = useRouter()
  const [page, setPage] = useState<
    'location' | 'get-session' | 'ach-details' | 'waiting'
  >('location')
  const [NameOnAccount, setNameOnAccount] = useState('')
  const [AccountNumber, setAccountNumber] = useState('')
  const [RoutingNumber, setRoutingNumber] = useState('')
  const [SavePaymentMethod, setSavePaymentMethod] = useState(true)
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>()
  const [amount, setAmount] = useState<number>()
  const [locationError, setLocationError] = useState<string>()
  const [loading, setloading] = useState(false)
  const [error, setError] = useState<string>()

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')

  const getCashoutSession = async (DeviceGPS: GPSData) => {
    setError(undefined)
    setloading(true)
    try {
      const res = await api('get-checkout-session-gidx', {
        DeviceGPS,
        PayActionCode: 'PAYOUT',
      })
      const { session, status, message } = res
      if (session && status !== 'error') {
        console.log('Got cashout session', session)
        const { CustomerProfile } = session
        setNameOnAccount(
          CustomerProfile.Name.FirstName + ' ' + CustomerProfile.Name.LastName
        )
        setAddress(CustomerProfile.Address.AddressLine1)
        setCity(CustomerProfile.Address.City)
        setState(CustomerProfile.Address.StateCode)
        setZipCode(CustomerProfile.Address.PostalCode)
        setCheckoutSession(session)
        setPage('ach-details')
      } else if (message && status === 'error') {
        setError(message)
        setloading(false)
      }
    } catch (e) {
      console.error('Error getting cashout session', e)
      setError('Error getting cashout session')
      setloading(false)
    }
  }
  const handleSubmit = async () => {
    setloading(true)
    setError(undefined)
    if (!checkoutSession || !amount) return
    // TODO: add billing address hook from checkout session
    try {
      await api('complete-cashout-session-gidx', {
        PaymentMethod: {
          Type: 'ACH',
          AccountNumber,
          RoutingNumber,
          NameOnAccount,
          BillingAddress: {
            AddressLine1: address,
            City: city,
            StateCode: state,
            PostalCode: zipCode,
            CountryCode: 'US',
          },
        },
        SavePaymentMethod,
        PaymentAmount: {
          dollars: amount,
          manaCash: amount,
        },
        MerchantSessionID: checkoutSession.MerchantSessionID,
        MerchantTransactionID: checkoutSession.MerchantTransactionID,
      })
      setPage('waiting')
    } catch (err) {
      setError('Failed to initiate cashout. Please try again.')
    }
    setloading(false)
  }

  useEffect(() => {
    if (!user) return
    if (getVerificationStatus(user).status !== 'success') {
      router.push('/gidx/register?redirect=cashout')
    }
  }, [user, router])

  const handleLocationReceived = (data: GPSData) => {
    setPage('get-session')
    getCashoutSession(data)
  }

  return (
    <Page trackPageView={'cashout page'}>
      <Col className="min-h-screen items-center justify-center py-12">
        <Row className="mb-8 text-3xl font-bold">Cash Out</Row>
        {!user || page === 'get-session' ? (
          <LoadingIndicator />
        ) : (
          page === 'location' && (
            <LocationPanel
              back={router.back}
              setLocation={handleLocationReceived}
              setLocationError={setLocationError}
              setLoading={setloading}
              loading={loading}
              locationError={locationError}
            />
          )
        )}
        {page === 'ach-details' && (
          <Col className="w-full max-w-md space-y-4">
            {/*TODO: show user cashout-able balance and cap the amount*/}
            <Input
              type="number"
              placeholder="Cashout Amount"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <Input
              type="text"
              placeholder="Account Number"
              value={AccountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
            <Input
              type="text"
              placeholder="Routing Number"
              value={RoutingNumber}
              onChange={(e) => setRoutingNumber(e.target.value)}
            />
            <Input
              type="text"
              placeholder="Account Name"
              value={NameOnAccount}
              onChange={(e) => setNameOnAccount(e.target.value)}
            />
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

            <Row className={'items-center gap-2'}>
              <input
                type={'checkbox'}
                checked={SavePaymentMethod}
                onChange={() => setSavePaymentMethod(!SavePaymentMethod)}
              />
              Save Payment Method
            </Row>
            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={
                loading ||
                !NameOnAccount ||
                !AccountNumber ||
                !RoutingNumber ||
                !amount
              }
            >
              Submit ACH Details
            </Button>
          </Col>
        )}
        {page === 'waiting' && (
          <Col className="items-center justify-center space-y-4">
            <p className="text-center text-lg">
              Your cashout request is being processed. We'll notify you once
              it's approved.
            </p>
          </Col>
        )}
        {error && <Row className="text-error mt-4">{error}</Row>}
      </Col>
    </Page>
  )
}

export default CashoutPage
