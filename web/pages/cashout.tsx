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
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'
import { MIN_CASHOUT_AMOUNT, SWEEPIES_CASHOUT_FEE } from 'common/economy'
import { formatSweepsNumber, formatSweepsToUSD } from 'common/util/format'
import { AmountInput } from 'web/components/widgets/amount-input'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { UploadDocuments } from 'web/components/gidx/upload-document'

const CashoutPage = () => {
  const user = useUser()
  const router = useRouter()
  const [page, setPage] = useState<
    'location' | 'get-session' | 'ach-details' | 'waiting' | 'documents'
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
  const [sessionStatus, setSessionStatus] = useState<string>()
  useApiSubscription({
    topics: [
      `gidx-checkout-session/${checkoutSession?.MerchantSessionID ?? '_'}`,
    ],
    onBroadcast: ({ data }) => {
      const { StatusCode, StatusMessage } = data
      console.log('ws update', StatusMessage, StatusCode)
      setSessionStatus(StatusMessage as string)
    },
  })
  const { data: redeemable } = useAPIGetter('get-redeemable-prize-cash', {})
  const redeemableCash = redeemable?.redeemablePrizeCash ?? 0

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
          dollars: (1 - SWEEPIES_CASHOUT_FEE) * amount,
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
    console.log('user', getVerificationStatus(user, false))
    if (getVerificationStatus(user, false).status !== 'success') {
      router.push('/gidx/register?redirect=cashout')
    }
  }, [user, router])

  const handleLocationReceived = (data: GPSData) => {
    if (user?.kycDocumentStatus === 'await-documents') {
      setPage('documents')
      return
    }
    setPage('get-session')
    getCashoutSession(data)
  }

  return (
    <Page trackPageView={'cashout page'}>
      <Col className=" px-2 py-4 sm:px-4">
        <Row className="mb-8 w-full justify-start text-3xl text-indigo-700">
          Cash Out
        </Row>
        {!user || page === 'get-session' ? (
          <LoadingIndicator />
        ) : page === 'documents' ? (
          <UploadDocuments
            back={router.back}
            next={() => setPage('ach-details')}
          />
        ) : page === 'location' ? (
          <LocationPanel
            back={router.back}
            setLocation={handleLocationReceived}
            setLocationError={setLocationError}
            setLoading={setloading}
            loading={loading}
            locationError={locationError}
          />
        ) : (
          page === 'ach-details' && (
            <Col className="w-full max-w-md space-y-4">
              {/*TODO: cap the amounts on min and max allowed side, in addition to user balance*/}
              <Row className={'justify-between font-semibold'}>
                Available to withdraw
                <CoinNumber amount={redeemableCash} coinType={'sweepies'} />
              </Row>

              <Row className={'items-center justify-between font-semibold'}>
                Cashout Amount <br className={'sm:hidden'} />
                (min {formatSweepsNumber(MIN_CASHOUT_AMOUNT)})
                <AmountInput
                  placeholder="Cashout Amount"
                  amount={amount}
                  inputClassName={'w-40'}
                  label={<SweepiesCoin className={'mb-1'} />}
                  onChangeAmount={(newAmount) => {
                    if (!newAmount) {
                      setAmount(undefined)
                      return
                    }
                    if (newAmount > redeemableCash) {
                      setAmount(redeemableCash)
                    } else {
                      setAmount(newAmount)
                    }
                  }}
                />
              </Row>
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
                size={'lg'}
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
                <Row className={'gap-1'}>
                  Withdraw{' '}
                  <CoinNumber amount={amount ?? 0} coinType={'sweepies'} /> for{' '}
                  {formatSweepsToUSD(
                    (1 - SWEEPIES_CASHOUT_FEE) * (amount ?? 0)
                  )}
                </Row>
              </Button>
            </Col>
          )
        )}
        {page === 'waiting' && (
          <Row className="space-y-4">
            Your cashout request is being processed. We'll notify you in 3-5
            business days once it's approved.
          </Row>
        )}
        {error && <Row className="text-error mt-4">{error}</Row>}
        {sessionStatus && sessionStatus.toLowerCase().includes('timeout') && (
          <Row className="text-error mt-4">
            {sessionStatus} - refresh to try again
          </Row>
        )}
      </Col>
    </Page>
  )
}

export default CashoutPage
