import {
  KYC_VERIFICATION_BONUS_CASH,
  MIN_CASHOUT_AMOUNT,
  SWEEPIES_CASHOUT_FEE,
} from 'common/economy'
import { CheckoutSession, GPSData } from 'common/gidx/gidx'
import {
  ageBlocked,
  getVerificationStatus,
  IDENTIFICATION_FAILED_MESSAGE,
  locationBlocked,
  PHONE_NOT_VERIFIED_MESSAGE,
  USER_BLOCKED_MESSAGE,
  USER_NOT_REGISTERED_MESSAGE,
} from 'common/user'
import { formatSweepies, formatSweepsToUSD } from 'common/util/format'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { SelectCashoutOptions } from 'web/components/cashout/select-cashout-options'
import { LocationPanel } from 'web/components/gidx/location-panel'
import { UploadDocuments } from 'web/components/gidx/upload-document'
import { AmountInput } from 'web/components/widgets/amount-input'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { Col } from '../components/layout/col'
import { Page } from '../components/layout/page'
import { Row } from '../components/layout/row'
import { CashToManaForm } from 'web/components/cashout/cash-to-mana'
import { SWEEPIES_NAME, TRADED_TERM, TRADING_TERM } from 'common/envs/constants'
import { RegisterIcon } from 'web/public/custom-components/registerIcon'
import Link from 'next/link'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'
import { RiUserForbidLine } from 'react-icons/ri'
import { MdOutlineNotInterested } from 'react-icons/md'
import clsx from 'clsx'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'

export type CashoutPagesType =
  | 'select-cashout-method'
  | MoneyCashoutPagesType
  | ManaCashoutPagesType

type MoneyCashoutPagesType =
  | 'location'
  | 'get-session'
  | 'ach-details'
  | 'waiting'
  | 'documents'

type ManaCashoutPagesType = 'custom-mana'

function SweepiesStats(props: {
  redeemableCash: number
  cashBalance: number
  className?: string
}) {
  const { redeemableCash, cashBalance, className } = props
  return (
    <Col className={clsx('w-full items-start', className)}>
      <div className="text-ink-500 whitespace-nowrap text-sm">
        Redeemable {SWEEPIES_NAME}
        <span>
          <InfoTooltip
            text={`Redeemable ${SWEEPIES_NAME} are obtained when questions you've ${TRADED_TERM} ${SWEEPIES_NAME} on resolve`}
            size={'sm'}
            className=" ml-0.5"
          />
        </span>
      </div>
      <CoinNumber
        amount={redeemableCash}
        className={'text-3xl font-bold'}
        coinType={'sweepies'}
      />
    </Col>
  )
}

const CashoutPage = () => {
  const user = useUser()
  const router = useRouter()
  const [page, setPage] = useState<CashoutPagesType>('select-cashout-method')
  const [NameOnAccount, setNameOnAccount] = useState('')
  const [AccountNumber, setAccountNumber] = useState('')
  const [RoutingNumber, setRoutingNumber] = useState('')
  const [SavePaymentMethod, _] = useState(false)
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>()
  const [amountInDollars, setAmountInDollars] = useState<number>()
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
    if (!checkoutSession || !amountInDollars) return
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
          dollars: (1 - SWEEPIES_CASHOUT_FEE) * amountInDollars,
          manaCash: amountInDollars,
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

  const handleLocationReceived = (data: GPSData) => {
    if (user?.kycDocumentStatus === 'await-documents') {
      setPage('documents')
      return
    }
    setPage('get-session')
    getCashoutSession(data)
  }

  const privateUser = usePrivateUser()

  if (!user || !privateUser) {
    return
  }

  const { status, message } = getVerificationStatus(user)

  const isLocationBlocked = locationBlocked(user, privateUser)
  const isAgeBlocked = ageBlocked(user, privateUser)

  if (isLocationBlocked) {
    return (
      <Page trackPageView={'cashout page'}>
        <Col className="mx-auto max-w-lg px-6 py-4">
          <Col className="items-center gap-2">
            <LocationBlockedIcon height={40} className="fill-ink-700" />
            <div className="text-2xl">Your location is blocked</div>
            <p className="text-ink-700 text-sm">
              You are unable to cash out at the moment.
            </p>
          </Col>
        </Col>
      </Page>
    )
  }

  if (isAgeBlocked) {
    return (
      <Page trackPageView={'cashout page'}>
        <Col className="mx-auto max-w-lg px-6 py-4">
          <Col className="items-center gap-2">
            <Col className="text-ink-700 ju h-40 w-40 items-center text-8xl font-bold">
              18+
            </Col>
            <div className="text-2xl">You must be 18 or older to cash out</div>
            <p className="text-ink-700 text-sm">
              You are unable to cash out at the moment.
            </p>
          </Col>
        </Col>
      </Page>
    )
  }

  // redirects to registration page if user if identification failed
  if (status !== 'success') {
    return (
      <Page trackPageView={'cashout page'}>
        <Col className="mx-auto max-w-lg px-6 py-4">
          {message == USER_NOT_REGISTERED_MESSAGE ||
          message == PHONE_NOT_VERIFIED_MESSAGE ||
          message == IDENTIFICATION_FAILED_MESSAGE ? (
            <Col className="items-center gap-2">
              <RegisterIcon height={40} className="fill-ink-700" />
              <div className="text-2xl">You're not registered yet...</div>
              <p className="text-ink-700 text-sm">
                Registration is required to cash out.
              </p>
              <Link
                href={'/gidx/register'}
                className="bg-primary-500 hover:bg-primary-600 whitespace-nowrap rounded-lg px-4 py-2 text-white"
              >
                Register and get{' '}
                <CoinNumber
                  amount={KYC_VERIFICATION_BONUS_CASH}
                  className={'font-bold'}
                  isInline
                  coinType={'CASH'}
                />
              </Link>
            </Col>
          ) : message == USER_BLOCKED_MESSAGE ? (
            <Col className="items-center gap-2">
              <RiUserForbidLine className="fill-ink-700 h-40 w-40" />
              <div className="text-2xl">Your registration failed</div>
              <p className="text-ink-700 text-sm">
                You are unable to cash out at the moment.
              </p>
            </Col>
          ) : (
            <Col className="items-center gap-2">
              <MdOutlineNotInterested className="fill-ink-700 h-40 w-40" />
              <div className="text-2xl">Cashout unavailable</div>
              <p className="text-ink-700 text-sm">
                You are unable to cash out at the moment.
              </p>
            </Col>
          )}
        </Col>
      </Page>
    )
  }

  return (
    <Page trackPageView={'cashout page'}>
      <Col className="mx-auto max-w-lg items-center gap-2 px-6 py-4">
        <Row className="text-primary-600 w-full justify-start text-3xl">
          Redeem {SWEEPIES_NAME}
        </Row>
        <SweepiesStats
          redeemableCash={redeemableCash}
          cashBalance={user.cashBalance}
          className="mb-4"
        />
        {!user || page === 'get-session' ? (
          <LoadingIndicator />
        ) : page == 'select-cashout-method' ? (
          <>
            <SelectCashoutOptions
              user={user}
              redeemableCash={redeemableCash}
              setPage={setPage}
            />
          </>
        ) : page == 'custom-mana' ? (
          <CashToManaForm
            onBack={() => setPage('select-cashout-method')}
            redeemableCash={redeemableCash}
          />
        ) : page == 'documents' ? (
          <UploadDocuments
            back={router.back}
            next={() => setPage('location')}
          />
        ) : page === 'location' ? (
          <LocationPanel
            back={() =>
              user?.kycDocumentStatus != 'verified'
                ? setPage('documents')
                : router.back()
            }
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
                (min {formatSweepies(MIN_CASHOUT_AMOUNT)})
                <AmountInput
                  placeholder="Cashout Amount"
                  amount={amountInDollars}
                  allowFloat={true}
                  inputClassName={'w-40'}
                  label={<SweepiesCoin className={'mb-1'} />}
                  onChangeAmount={(newAmount) => {
                    if (!newAmount) {
                      setAmountInDollars(undefined)
                      return
                    }
                    if (newAmount > redeemableCash) {
                      setAmountInDollars(redeemableCash)
                    } else {
                      setAmountInDollars(newAmount)
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
              {/*TODO: Re-enable*/}
              {/*<Row className={'items-center gap-2'}>*/}
              {/*  <input*/}
              {/*    type={'checkbox'}*/}
              {/*    checked={SavePaymentMethod}*/}
              {/*    onChange={() => setSavePaymentMethod(!SavePaymentMethod)}*/}
              {/*  />*/}
              {/*  Save Payment Method*/}
              {/*</Row>*/}
              <Button
                size={'lg'}
                onClick={handleSubmit}
                loading={loading}
                disabled={
                  loading ||
                  !NameOnAccount ||
                  !AccountNumber ||
                  !RoutingNumber ||
                  !amountInDollars
                }
              >
                <Row className={'gap-1'}>
                  Withdraw{' '}
                  <CoinNumber amount={amountInDollars} coinType={'sweepies'} />{' '}
                  for{' '}
                  {formatSweepsToUSD(
                    (1 - SWEEPIES_CASHOUT_FEE) * (amountInDollars ?? 0)
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
