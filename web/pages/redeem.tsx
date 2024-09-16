import clsx from 'clsx'
import {
  KYC_VERIFICATION_BONUS_CASH,
  MIN_CASHOUT_AMOUNT,
  SWEEPIES_CASHOUT_FEE,
} from 'common/economy'
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
import { api } from 'web/lib/api/api'
import { LocationBlockedIcon } from 'web/public/custom-components/locationBlockedIcon'
import { RegisterIcon } from 'web/public/custom-components/registerIcon'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { Col } from '../components/layout/col'
import { Page } from '../components/layout/page'
import { Row } from '../components/layout/row'
import { capitalize } from 'lodash'

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
    if (!checkoutSession || !amountInDollars) return
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
      setError('Failed to initiate redemption. Please try again.')
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
        <Col className="mx-auto max-w-lg gap-4 px-6 py-4">
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
                  <CoinNumber
                    amount={KYC_VERIFICATION_BONUS_CASH}
                    className={'font-bold'}
                    isInline
                    coinType={'CASH'}
                  />
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

  return (
    <Page trackPageView={'redemptions page'}>
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
              <Row className={'justify-between font-semibold'}>
                Available to redeem
                <CoinNumber amount={redeemableCash} coinType={'sweepies'} />
              </Row>

              <Row className={'items-center justify-between font-semibold'}>
                Amount to redeem <br className={'sm:hidden'} />
                (min {formatSweepies(MIN_CASHOUT_AMOUNT)})
                <AmountInput
                  placeholder="Redeem Amount"
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
                  Redeem{' '}
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
