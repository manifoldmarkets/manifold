import clsx from 'clsx'
import { MIN_CASHOUT_AMOUNT, SWEEPIES_CASHOUT_FEE } from 'common/economy'
import { SWEEPIES_NAME, TRADED_TERM } from 'common/envs/constants'
import { CheckoutSession, GPSData } from 'common/gidx/gidx'
import {
  ageBlocked,
  getVerificationStatus,
  locationBlocked,
  PROMPT_VERIFICATION_MESSAGES,
  USER_BLOCKED_MESSAGE,
} from 'common/user'
import { formatSweepies, formatSweepsToUSD } from 'common/util/format'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { MdOutlineNotInterested } from 'react-icons/md'
import { RiUserForbidLine } from 'react-icons/ri'
import {
  baseButtonClasses,
  Button,
  buttonClass,
} from 'web/components/buttons/button'
import { CashToManaForm } from 'web/components/cashout/cash-to-mana'
import { SelectCashoutOptions } from 'web/components/cashout/select-cashout-options'
import { LocationPanel } from 'web/components/gidx/location-panel'
import { UploadDocuments } from 'web/components/gidx/upload-document'
import { AmountInput } from 'web/components/widgets/amount-input'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api, APIError } from 'web/lib/api/api'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'
import { RegisterIcon } from 'web/public/custom-components/registerIcon'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { Col } from '../components/layout/col'
import { Page } from '../components/layout/page'
import { Row } from '../components/layout/row'
import { capitalize } from 'lodash'
import { useKYCGiftAmount } from 'web/components/twomba/toggle-verify-callout'
import {
  Divider,
  InputTitle,
} from 'web/components/gidx/register-component-helpers'
import { UsOnlyDisclaimer } from 'web/components/twomba/us-only-disclaimer'

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
    <Row className="w-full gap-4 text-2xl md:text-3xl">
      <Col className={clsx('w-1/2 items-start', className)}>
        <div className="text-ink-500 whitespace-nowrap text-sm">
          Redeemable
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
          className={'font-bold'}
          coinType={'sweepies'}
        />
      </Col>
      <div className="bg-ink-300 mb-4 mt-1 w-[1px]" />
      <Col className={clsx('w-1/2 items-start', className)}>
        <div className="text-ink-500 whitespace-nowrap text-sm">Total</div>
        <CoinNumber
          amount={cashBalance}
          className={'text-ink-500 font-bold'}
          coinType={'sweepies'}
        />
      </Col>
    </Row>
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
  const [sweepCashAmount, setSweepCashAmount] = useState<number | undefined>(
    MIN_CASHOUT_AMOUNT
  )
  const [locationError, setLocationError] = useState<string>()
  const [loading, setloading] = useState(false)
  const [error, setError] = useState<string>()

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [sessionStatus, setSessionStatus] = useState<string>()
  const [completedCashout, setCompletedCashout] = useState(0)
  const kycAmount = useKYCGiftAmount(user)

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
  const redeemableCash =
    (redeemable?.redeemablePrizeCash ?? 0) - completedCashout

  const roundedRedeemableCash = Math.floor(redeemableCash * 100) / 100

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
          capitalize(CustomerProfile.Name.FirstName.toLowerCase()) +
            ' ' +
            capitalize(CustomerProfile.Name.LastName.toLowerCase())
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
      console.error('Error getting redemption session', e)
      setError('Error getting redemption session')
      setloading(false)
    }
  }

  const handleSubmit = async () => {
    setloading(true)
    setError(undefined)
    if (!checkoutSession || !sweepCashAmount) return
    try {
      const { status, message } = await api('complete-cashout-session-gidx', {
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
          dollars: (1 - SWEEPIES_CASHOUT_FEE) * sweepCashAmount,
          manaCash: sweepCashAmount,
        },
        MerchantSessionID: checkoutSession.MerchantSessionID,
        MerchantTransactionID: checkoutSession.MerchantTransactionID,
      })
      if (status === 'error') {
        setError(message)
      } else {
        setPage('waiting')
        setCompletedCashout(sweepCashAmount)
      }
    } catch (err) {
      if (err instanceof APIError) {
        setError((err as APIError).message)
      } else {
        console.error('Error completing cashout session', err)
        setError('Failed to initiate redemption. Please try again.')
      }
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

  // redirects to registration page if user if identification failed
  if (status !== 'success' || isLocationBlocked || isAgeBlocked) {
    return (
      <Page trackPageView={'redeem sweeps page'}>
        <Col className="bg-canvas-0 mx-auto max-w-lg gap-4 px-6 py-4">
          <Row className="w-full justify-end">
            <UsOnlyDisclaimer />
          </Row>
          {isLocationBlocked ? (
            <Row className="items-center gap-4">
              <LocationBlockedIcon height={16} className="fill-red-500" />
              <Col className="gap-2">
                <div className="text-2xl">Your location is blocked!</div>
                <p className="text-ink-700 text-sm">
                  You are unable to redeem at the moment.
                </p>
              </Col>
            </Row>
          ) : isAgeBlocked ? (
            <Row className="items-center gap-4">
              <RiUserForbidLine className="h-16 w-16 shrink-0 fill-red-500" />
              <Col className="gap-2">
                <div className="text-2xl">You must be 18+</div>
                <p className="text-ink-700 text-sm">
                  You are unable to redeem at the moment.
                </p>
              </Col>
            </Row>
          ) : PROMPT_VERIFICATION_MESSAGES.includes(message) ? (
            <Col className="mb-4 gap-4">
              <Row className="w-full items-center gap-4">
                <RegisterIcon
                  height={16}
                  className="fill-ink-700 hidden sm:inline"
                />
                <Col className="w-full gap-2">
                  <div className="text-2xl">You're not verified yet...</div>
                  <p className="text-ink-700 text-sm">
                    Verification is required to redeem {SWEEPIES_NAME}.
                  </p>
                </Col>
              </Row>
              <Link
                href={'/gidx/register'}
                className={clsx(
                  baseButtonClasses,
                  buttonClass('lg', 'gradient-pink')
                )}
              >
                Verify and get
                <span className="ml-1">
                  {kycAmount == undefined ? (
                    ' a sweepcash gift!'
                  ) : (
                    <CoinNumber
                      amount={kycAmount}
                      className={'font-bold'}
                      isInline
                      coinType={'CASH'}
                    />
                  )}
                </span>
              </Link>
            </Col>
          ) : message == USER_BLOCKED_MESSAGE ? (
            <Row className="items-center gap-4">
              <RiUserForbidLine className="hidden h-16 w-16 fill-red-500 sm:inline" />
              <Col className="gap-2">
                <div className="text-2xl">Your verification failed</div>
                <p className="text-ink-700 text-sm">
                  You are unable to redeem at the moment.
                </p>
              </Col>
            </Row>
          ) : (
            <Row className="items-center gap-4">
              <MdOutlineNotInterested className="hidden h-16 w-16 fill-red-500 sm:inline" />
              <Col className="gap-2">
                <div className="text-2xl">Redemptions unavailable</div>
                <p className="text-ink-700 text-sm">
                  You are unable to redeem at the moment.
                </p>
              </Col>
            </Row>
          )}
          {(isLocationBlocked || isAgeBlocked) && (
            <SweepiesStats
              redeemableCash={redeemableCash}
              cashBalance={user.cashBalance}
              className="text-ink-700 mb-4"
            />
          )}
          <SelectCashoutOptions
            user={user}
            redeemableCash={redeemableCash}
            setPage={setPage}
            allDisabled={true}
          />
        </Col>
      </Page>
    )
  }

  const lessThanMinRedeemable =
    !sweepCashAmount || sweepCashAmount < MIN_CASHOUT_AMOUNT

  return (
    <Page trackPageView={'redemptions page'}>
      <Col className="bg-canvas-0 mx-auto max-w-lg items-center gap-2 px-6 py-4">
        <Row className="w-full justify-end">
          <UsOnlyDisclaimer />
        </Row>
        <Row className="text-ink-1000 w-full justify-center text-3xl">
          Redeem {SWEEPIES_NAME}
        </Row>
        <SweepiesStats
          redeemableCash={redeemableCash}
          cashBalance={user.cashBalance}
          className="my-4"
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
            <Col className="w-full space-y-4">
              <Col className={'w-full gap-0.5'}>
                <InputTitle>Redeem</InputTitle>
                <AmountInput
                  placeholder="Redeem Amount"
                  amount={sweepCashAmount}
                  allowFloat={true}
                  min={MIN_CASHOUT_AMOUNT}
                  inputClassName={'w-full'}
                  label={<SweepiesCoin className={'mb-1'} />}
                  onChangeAmount={(newAmount) => {
                    if (!newAmount) {
                      setSweepCashAmount(undefined)
                      return
                    }
                    if (newAmount > roundedRedeemableCash) {
                      setSweepCashAmount(roundedRedeemableCash)
                    } else {
                      setSweepCashAmount(newAmount)
                    }
                  }}
                />
                <div className="h-2">
                  {lessThanMinRedeemable && (
                    <div className="text-sm text-red-600 dark:text-red-400">
                      The minimum redeemable amount is{' '}
                      {formatSweepies(MIN_CASHOUT_AMOUNT)}
                    </div>
                  )}
                </div>
              </Col>
              <Divider />
              <Col className={'w-full gap-0.5'}>
                <InputTitle>Name</InputTitle>
                <Input
                  type="text"
                  placeholder="Name associated with account"
                  value={NameOnAccount}
                  onChange={(e) => setNameOnAccount(e.target.value)}
                />
              </Col>
              <Col className={'w-full gap-0.5'}>
                <InputTitle>Account Number</InputTitle>
                <Input
                  type="text"
                  placeholder="Your account #"
                  value={AccountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </Col>
              <Col className={'w-full gap-0.5'}>
                <InputTitle>Routing Number</InputTitle>
                <Input
                  type="text"
                  placeholder="Your bank's routing #"
                  value={RoutingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                />
              </Col>
              <Divider />
              <Col className={'w-full gap-0.5'}>
                <InputTitle>Billing Address</InputTitle>
                <Input
                  type="text"
                  placeholder="Billing Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Col>
              <Col className={'w-full gap-0.5'}>
                <InputTitle>City</InputTitle>
                <Input
                  type="text"
                  placeholder="Your city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full"
                />
              </Col>

              <div className={'flex w-full flex-col gap-4 sm:flex-row'}>
                <Col className={'w-full gap-0.5 sm:w-1/2'}>
                  <InputTitle>State</InputTitle>
                  <Input
                    type="text"
                    placeholder="Your state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  />
                </Col>

                <Col className={'w-full gap-0.5 sm:w-1/2'}>
                  <InputTitle>Postal Code</InputTitle>
                  <Input
                    type="text"
                    placeholder="Your postal code"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                  />
                </Col>
              </div>
              {/*TODO: Re-enable*/}
              {/*<Row className={'items-center gap-2'}>*/}
              {/*  <input*/}
              {/*    type={'checkbox'}*/}
              {/*    checked={SavePaymentMethod}*/}
              {/*    onChange={() => setSavePaymentMethod(!SavePaymentMethod)}*/}
              {/*  />*/}
              {/*  Save Payment Method*/}
              {/*</Row>*/}
              <Row className=" mt-2 w-full gap-2">
                <Button
                  color="gray"
                  onClick={() => setPage('select-cashout-method')}
                >
                  Back
                </Button>
                <Button
                  size={'lg'}
                  onClick={handleSubmit}
                  loading={loading}
                  disabled={
                    loading ||
                    !NameOnAccount ||
                    !AccountNumber ||
                    !RoutingNumber ||
                    !sweepCashAmount ||
                    lessThanMinRedeemable
                  }
                  className="flex-1"
                >
                  <Row className={'gap-1'}>
                    Redeem for{' '}
                    {formatSweepsToUSD(
                      (1 - SWEEPIES_CASHOUT_FEE) * (sweepCashAmount ?? 0)
                    )}
                  </Row>
                </Button>
              </Row>
            </Col>
          )
        )}
        {page === 'waiting' && (
          <Row className="space-y-4">
            Your redemption request is being processed. We'll notify you in 3-5
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
