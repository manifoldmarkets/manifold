import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import {
  KYC_VERIFICATION_BONUS_CASH,
  MIN_CASHOUT_AMOUNT,
  SWEEPIES_CASHOUT_FEE,
} from 'common/economy'
import {
  SWEEPIES_NAME,
  TWOMBA_CASHOUT_ENABLED,
  CASH_TO_MANA_CONVERSION_RATE,
} from 'common/envs/constants'
import {
  formatSweepies,
  formatMoneyUSD,
  formatSweepsToUSD,
} from 'common/util/format'
import { UploadDocuments } from 'components/upload-document'
import { LocationPanel } from 'components/location-panel'
import { CheckoutSession, GPSData } from 'common/gidx/gidx'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { APIError } from 'common/api/utils'
import { useEvent } from 'client-common/hooks/use-event'
import {
  ageBlocked,
  documentPending,
  fraudSession,
  getVerificationStatus,
  identityBlocked,
  locationBlocked,
  PROMPT_USER_VERIFICATION_MESSAGES,
} from 'common/gidx/user'
import { capitalize } from 'lodash'
import { Input } from 'components/widgets/input'
import { api } from 'lib/api'
import { useAPIGetter } from 'hooks/use-api-getter'
import { useUser } from 'hooks/use-user'
import { usePrivateUser } from 'hooks/use-user'
import { useMonitorStatus } from 'hooks/use-monitor-status'
import { Colors, emerald, purple } from 'constants/colors'
import { Rounded } from 'constants/border-radius'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'
import Page from 'components/page'
import { Button } from 'components/buttons/button'
import { ContractToken } from 'common/contract'
import { TokenNumber } from 'components/token/token-number'
import { formatMoneyVerbatim } from 'util/format'
import { NumberText } from 'components/number-text'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'

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

// const CASHOUTS_PER_PAGE = 10

export default function CashoutPage() {
  const user = useUser()
  const privateUser = usePrivateUser()
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
  const [deviceGPS, setDeviceGPS] = useState<GPSData>()

  const { data: documentData } = useAPIGetter(
    'get-verification-documents-gidx',
    {}
  )
  const { utilityDocuments, idDocuments } = documentData ?? {}
  const mustUploadDocs =
    (utilityDocuments?.length ?? 0) <= 0 || (idDocuments?.length ?? 0) <= 0
  const [failedDocs, setFailedDocs] = useState(false)
  useEffect(() => {
    if (!user) return
    setFailedDocs(user.kycDocumentStatus === 'fail')
  }, [user?.kycDocumentStatus])

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

  const redeemableCash = user?.cashBalance ?? 0

  const roundedRedeemableCash = Math.floor(redeemableCash * 100) / 100
  const {
    requestLocationThenFetchMonitorStatus,
    loading: loadingMonitorStatus,
    monitorStatusMessage,
    monitorStatus,
  } = useMonitorStatus(false, user)

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
      }
    } catch (e) {
      console.error('Error getting redemption session', e)
    }
    setloading(false)
  }

  const handleSubmit = async () => {
    setloading(true)
    setError(undefined)
    if (!checkoutSession || !sweepCashAmount || !deviceGPS) return
    try {
      const { status, message } = await api('complete-cashout-request', {
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
          dollars: sweepCashAmount - SWEEPIES_CASHOUT_FEE,
          manaCash: sweepCashAmount,
        },
        MerchantSessionID: checkoutSession.MerchantSessionID,
        MerchantTransactionID: checkoutSession.MerchantTransactionID,
        DeviceGPS: deviceGPS,
      })
      if (status === 'error') {
        setError(message)
      } else {
        setPage('waiting')
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

  const handleLocationReceived = useEvent((data: GPSData) => {
    setPage('get-session')
    getCashoutSession(data)
    setDeviceGPS(data)
  })

  if (!user || !privateUser) {
    return (
      <Page>
        <ThemedText size="3xl" weight="bold" style={{ marginBottom: 8 }}>
          Redeem {SWEEPIES_NAME}
        </ThemedText>
        <CashoutOptionsExplainer />
      </Page>
    )
  }

  const { status, message } = getVerificationStatus(user, privateUser)

  if (status !== 'success' || (failedDocs && mustUploadDocs)) {
    return (
      <Page>
        {locationBlocked(user, privateUser) ? (
          <Col>
            <Col style={{ marginBottom: 24 }}>
              <Col style={{ gap: 4 }}>
                <ThemedText
                  size="3xl"
                  weight="bold"
                  style={{ marginBottom: 4 }}
                >
                  Your location is blocked!
                </ThemedText>
                <ThemedText
                  size="md"
                  color={Colors.textSecondary}
                  style={{ marginBottom: 16 }}
                >
                  You are unable to redeem at the moment.
                </ThemedText>
              </Col>
            </Col>
            <Button
              onPress={() => requestLocationThenFetchMonitorStatus()}
              disabled={loadingMonitorStatus}
            >
              <ThemedText size="md" weight="semibold">
                Refresh status
              </ThemedText>
            </Button>
            {monitorStatus === 'error' && (
              <ThemedText color={Colors.error} size="sm">
                {monitorStatusMessage}
              </ThemedText>
            )}
          </Col>
        ) : ageBlocked(user, privateUser) ? (
          <Col style={{ marginBottom: 24 }}>
            <Col style={{ gap: 4 }}>
              <ThemedText size="3xl" weight="bold" style={{ marginBottom: 4 }}>
                You must be 18+
              </ThemedText>
              <ThemedText
                size="md"
                color={Colors.textSecondary}
                style={{ marginBottom: 16 }}
              >
                You are unable to redeem at the moment.
              </ThemedText>
            </Col>
          </Col>
        ) : PROMPT_USER_VERIFICATION_MESSAGES.includes(message) ? (
          <Col style={{ marginBottom: 16, gap: 16 }}>
            <Col style={{ marginBottom: 24 }}>
              <Col style={{ gap: 4 }}>
                <ThemedText
                  size="3xl"
                  weight="bold"
                  style={{ marginBottom: 4 }}
                >
                  You're not verified yet...
                </ThemedText>
                <ThemedText
                  size="md"
                  color={Colors.textSecondary}
                  style={{ marginBottom: 16 }}
                >
                  Verification is required to redeem {SWEEPIES_NAME}.
                </ThemedText>
              </Col>
            </Col>
            <Button
              onPress={() => router.push('/register')}
              variant="emerald"
              size="lg"
            >
              <ThemedText size="md" weight="semibold">
                Verify and get {KYC_VERIFICATION_BONUS_CASH} {SWEEPIES_NAME}
              </ThemedText>
            </Button>
            <ThemedText
              size="md"
              color={Colors.textSecondary}
              style={{ marginTop: 4, textAlign: 'center' }}
            >
              Only for eligible US residents
            </ThemedText>
          </Col>
        ) : fraudSession(user, privateUser) ? (
          <Col style={{ marginBottom: 24 }}>
            <Col style={{ gap: 4 }}>
              <ThemedText size="3xl" weight="bold" style={{ marginBottom: 4 }}>
                Suspicious activity detected
              </ThemedText>
              <ThemedText
                size="md"
                color={Colors.textSecondary}
                style={{ marginBottom: 16 }}
              >
                Your session is marked as possible fraud, please turn off VPN if
                using.
              </ThemedText>
              <Button
                onPress={() => requestLocationThenFetchMonitorStatus()}
                disabled={loadingMonitorStatus}
              >
                <ThemedText size="md" weight="semibold">
                  Refresh status
                </ThemedText>
              </Button>
              {monitorStatus === 'error' && (
                <ThemedText color={Colors.error} size="sm">
                  {monitorStatusMessage}
                </ThemedText>
              )}
            </Col>
          </Col>
        ) : identityBlocked(user, privateUser) ? (
          <Col style={{ marginBottom: 24 }}>
            <Col style={{ gap: 4 }}>
              <ThemedText size="3xl" weight="bold" style={{ marginBottom: 4 }}>
                Your identity is blocked
              </ThemedText>
              <ThemedText
                size="md"
                color={Colors.textSecondary}
                style={{ marginBottom: 16 }}
              >
                You cannot participate in sweepstakes market.
              </ThemedText>
            </Col>
          </Col>
        ) : failedDocs && mustUploadDocs ? (
          <UploadDocuments
            back={router.back}
            next={() => setFailedDocs(false)}
            requireUtilityDoc={true}
          />
        ) : documentPending(user, privateUser) ? (
          <Col style={{ marginBottom: 24 }}>
            <Col style={{ gap: 4 }}>
              <ThemedText size="3xl" weight="bold" style={{ marginBottom: 4 }}>
                Identity documents pending
              </ThemedText>
              <ThemedText
                size="md"
                color={Colors.textSecondary}
                style={{ marginBottom: 16 }}
              >
                You are unable to redeem at the moment.
              </ThemedText>
            </Col>
          </Col>
        ) : (
          <Col style={{ marginBottom: 24 }}>
            <Col style={{ gap: 4 }}>
              <ThemedText size="3xl" weight="bold" style={{ marginBottom: 4 }}>
                Redemptions unavailable
              </ThemedText>
              <ThemedText
                size="md"
                color={Colors.textSecondary}
                style={{ marginBottom: 16 }}
              >
                You are unable to redeem at the moment.
              </ThemedText>
            </Col>
          </Col>
        )}
        <SweepiesStats
          redeemableCash={redeemableCash}
          cashBalance={user.cashBalance}
        />
        <SelectCashoutOptions
          redeemForUSDPageName={mustUploadDocs ? 'documents' : 'location'}
          user={user}
          redeemableCash={redeemableCash}
          setPage={setPage}
          allDisabled={true}
        />
      </Page>
    )
  }

  const lessThanMinRedeemable =
    !sweepCashAmount || sweepCashAmount < MIN_CASHOUT_AMOUNT

  return (
    <Page>
      <ThemedText size="3xl" weight="bold" style={{ marginBottom: 8 }}>
        Redeem {SWEEPIES_NAME}
      </ThemedText>
      <SweepiesStats
        redeemableCash={redeemableCash}
        cashBalance={user.cashBalance}
      />
      {!user || page === 'get-session' ? (
        <ActivityIndicator />
      ) : page == 'select-cashout-method' ? (
        <>
          <SelectCashoutOptions
            redeemForUSDPageName={mustUploadDocs ? 'documents' : 'location'}
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
          requireUtilityDoc={true}
        />
      ) : page === 'location' ? (
        <LocationPanel
          location={deviceGPS}
          back={() => (mustUploadDocs ? setPage('documents') : router.back())}
          setLocation={handleLocationReceived}
          setLocationError={setLocationError}
          setLoading={setloading}
          loading={loading}
          locationError={locationError}
        />
      ) : (
        page === 'ach-details' && (
          <Col style={{ gap: 16, width: '100%' }}>
            <Col style={{ gap: 8 }}>
              <ThemedText size="md" weight="semibold">
                Redeem
              </ThemedText>
              <AmountInput
                placeholder="Redeem Amount"
                amount={sweepCashAmount}
                min={MIN_CASHOUT_AMOUNT}
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
              {lessThanMinRedeemable && (
                <ThemedText color={Colors.error} size="sm">
                  The minimum redeemable amount is{' '}
                  {formatSweepies(MIN_CASHOUT_AMOUNT)}
                </ThemedText>
              )}
            </Col>
            <Col style={{ gap: 8 }}>
              <ThemedText size="md" weight="semibold">
                Name
              </ThemedText>
              <Input
                placeholder="Name associated with account"
                value={NameOnAccount}
                onChangeText={setNameOnAccount}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Rounded.lg,
                  padding: 12,
                }}
              />
            </Col>
            <Col style={{ gap: 8 }}>
              <ThemedText size="md" weight="semibold">
                Account Number
              </ThemedText>
              <Input
                keyboardType="numeric"
                placeholder="Your account #"
                value={AccountNumber}
                onChangeText={setAccountNumber}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Rounded.lg,
                  padding: 12,
                }}
              />
            </Col>
            <Col style={{ gap: 8 }}>
              <ThemedText size="md" weight="semibold">
                Routing Number
              </ThemedText>
              <Input
                keyboardType="numeric"
                placeholder="Your bank's routing #"
                value={RoutingNumber}
                onChangeText={setRoutingNumber}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Rounded.lg,
                  padding: 12,
                }}
              />
            </Col>
            <Col style={{ gap: 8 }}>
              <ThemedText size="md" weight="semibold">
                Billing Address
              </ThemedText>
              <Input
                placeholder="Billing Address"
                value={address}
                onChangeText={setAddress}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Rounded.lg,
                  padding: 12,
                }}
              />
            </Col>
            <Col style={{ gap: 8 }}>
              <ThemedText size="md" weight="semibold">
                City
              </ThemedText>
              <Input
                placeholder="Your city"
                value={city}
                onChangeText={setCity}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Rounded.lg,
                  padding: 12,
                }}
              />
            </Col>
            <Col style={{ gap: 8 }}>
              <ThemedText size="md" weight="semibold">
                State
              </ThemedText>
              <Input
                placeholder="Your state"
                value={state}
                onChangeText={setState}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Rounded.lg,
                  padding: 12,
                }}
              />
            </Col>
            <Col style={{ gap: 8 }}>
              <ThemedText size="md" weight="semibold">
                Postal Code
              </ThemedText>
              <Input
                keyboardType="numeric"
                placeholder="Your postal code"
                value={zipCode}
                onChangeText={setZipCode}
                style={{
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Rounded.lg,
                  padding: 12,
                }}
              />
            </Col>
            <Row>
              <Button
                onPress={handleSubmit}
                disabled={
                  loading ||
                  !NameOnAccount ||
                  !AccountNumber.length ||
                  !RoutingNumber.length ||
                  !sweepCashAmount ||
                  lessThanMinRedeemable ||
                  !deviceGPS
                }
                loading={loading}
                size="lg"
                style={{ flex: 1 }}
              >
                <ThemedText size="md" weight="semibold">
                  Redeem for{' '}
                  {formatSweepsToUSD(
                    (sweepCashAmount ?? 0) - SWEEPIES_CASHOUT_FEE
                  )}
                </ThemedText>
              </Button>
            </Row>
          </Col>
        )
      )}
      {page === 'waiting' && (
        <ThemedText size="md" style={{ textAlign: 'center', marginTop: 16 }}>
          Your redemption request is being processed. We'll notify you in 3-5
          business days once it's approved.
        </ThemedText>
      )}
      {error && (
        <ThemedText color={Colors.error} size="sm">
          {error}
        </ThemedText>
      )}
      {sessionStatus && sessionStatus.toLowerCase().includes('timeout') && (
        <ThemedText color={Colors.error} size="sm">
          {sessionStatus} - refresh to try again
        </ThemedText>
      )}
    </Page>
  )
}

function SweepiesStats(props: { redeemableCash: number; cashBalance: number }) {
  const { redeemableCash, cashBalance } = props
  return (
    <Col style={{ marginBottom: 24 }}>
      <Row
        style={{
          alignItems: 'center',
          marginBottom: 8,
          justifyContent: 'space-between',
        }}
      >
        <ThemedText size="md" color={Colors.textSecondary} style={{ flex: 1 }}>
          Redeemable
        </ThemedText>
        <TokenNumber
          amount={redeemableCash}
          style={{ fontSize: 16, fontWeight: '600' }}
          token="CASH"
        />
      </Row>
      <View
        style={{
          width: '100%',
          height: 1,
          backgroundColor: Colors.border,
          marginVertical: 8,
        }}
      />
      <Row
        style={{
          alignItems: 'center',
          marginBottom: 8,
          justifyContent: 'space-between',
        }}
      >
        <ThemedText size="md" color={Colors.textSecondary} style={{ flex: 1 }}>
          Total
        </ThemedText>
        <TokenNumber
          amount={cashBalance}
          style={{ fontSize: 16, fontWeight: '600' }}
          token="CASH"
        />
      </Row>
    </Col>
  )
}

function CashoutOptionsExplainer() {
  return (
    <View>
      <ThemedText size="md" style={{ marginBottom: 8 }}>
        Prizes you can win by playing in our sweepstakes questions!
      </ThemedText>
      <ThemedText
        size="md"
        color={Colors.textSecondary}
        style={{ marginBottom: 8 }}
      >
        Must be a US Resident. 18+ only.
      </ThemedText>
    </View>
  )
}

function SelectCashoutOptions(props: {
  redeemForUSDPageName: CashoutPagesType
  user: any
  redeemableCash: number
  setPage: (page: CashoutPagesType) => void
  allDisabled?: boolean
}) {
  const { setPage, allDisabled, redeemableCash, redeemForUSDPageName } = props
  // const [cashoutPage, setCashoutPage] = useState(0)
  //
  // const { data: cashouts } = useAPIGetter('get-cashouts', {
  //   limit: CASHOUTS_PER_PAGE,
  //   offset: cashoutPage * CASHOUTS_PER_PAGE,
  //   userId: props.user.id,
  // })

  const noHasMinRedeemableCash = redeemableCash < MIN_CASHOUT_AMOUNT
  const hasNoRedeemableCash = redeemableCash === 0
  const color = useColor()

  return (
    <Col style={{ gap: 16, width: '100%' }}>
      <Card
        title={'Redeem for Mana'}
        description={
          <>
            Redeem {SWEEPIES_NAME} at{' '}
            <NumberText color={color.textSecondary} size="md">
              1 → {formatMoneyVerbatim(CASH_TO_MANA_CONVERSION_RATE, 'MANA')}
            </NumberText>
          </>
        }
        button={
          <Button
            variant="purple"
            onPress={() => setPage('custom-mana')}
            disabled={!!allDisabled || hasNoRedeemableCash}
            size="lg"
          >
            <ThemedText>Redeem for mana</ThemedText>
          </Button>
        }
        subtitle={
          <TokenNumber
            amount={redeemableCash * CASH_TO_MANA_CONVERSION_RATE}
            style={[
              {
                color: purple[400],
              },
            ]}
            token="MANA"
          />
        }
      />

      <Card
        title={'Redeem for USD'}
        description={
          <>
            Redeem {SWEEPIES_NAME} at{' '}
            <NumberText color={color.textSecondary} size="md">
              1 → {formatMoneyUSD(1)}
            </NumberText>
            , minus a{' '}
            <NumberText color={color.textSecondary} size="md">
              {formatMoneyUSD(SWEEPIES_CASHOUT_FEE)}
            </NumberText>{' '}
            flat fee.
          </>
        }
        button={
          <>
            <Button
              onPress={() => setPage(redeemForUSDPageName)}
              disabled={
                !!allDisabled ||
                noHasMinRedeemableCash ||
                !TWOMBA_CASHOUT_ENABLED
              }
              size="lg"
            >
              Redeem for USD
            </Button>
            {!TWOMBA_CASHOUT_ENABLED && (
              <ThemedText style={{ color: color.textSecondary }}>
                Cashouts should be enabled in less than a week
              </ThemedText>
            )}
          </>
        }
        subtitle={
          <>
            {noHasMinRedeemableCash && !allDisabled ? (
              <Row style={{ alignItems: 'center' }}>
                <ThemedText color={color.error} size="sm">
                  You need at least{' '}
                  <NumberText color={color.error} size="sm">
                    {MIN_CASHOUT_AMOUNT}
                  </NumberText>{' '}
                  sweepcash to redeem{' '}
                </ThemedText>
              </Row>
            ) : (
              <>
                <ThemedText
                  style={[
                    {
                      color: emerald[400],
                    },
                  ]}
                >
                  ${(redeemableCash - SWEEPIES_CASHOUT_FEE).toFixed(2)}
                </ThemedText>
                <ThemedText style={{ color: color.textSecondary }}>
                  value
                </ThemedText>
              </>
            )}
          </>
        }
      />
    </Col>
  )
}

function Card({
  title,
  description,
  button,
  subtitle,
}: {
  title: string
  description: React.ReactNode
  button: React.ReactNode
  subtitle?: React.ReactNode
}) {
  // return <View style={styles.card}>{children}</View>
  return (
    <Col
      style={{
        backgroundColor: Colors.backgroundSecondary,
        borderRadius: Rounded.lg,
        padding: 16,
        paddingBottom: subtitle ? 8 : 16,
        gap: 8,
      }}
    >
      <ThemedText size="lg" weight="semibold">
        {title}
      </ThemedText>
      <ThemedText size="md" color={Colors.textSecondary}>
        {description}
      </ThemedText>
      {button}
      <Row style={{ justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
        {subtitle}
      </Row>
    </Col>
  )
}

function CashToManaForm(props: { onBack: () => void; redeemableCash: number }) {
  const { onBack, redeemableCash } = props
  const roundedRedeemableCash = Math.floor(redeemableCash * 100) / 100
  const [sweepiesAmount, setSweepiesAmount] = useState<number | undefined>(
    roundedRedeemableCash
  )
  const [manaAmount, setManaAmount] = useState<number | undefined>(
    roundedRedeemableCash * CASH_TO_MANA_CONVERSION_RATE
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateAmounts = (
    newAmount: number | undefined,
    type: ContractToken
  ) => {
    if (type === 'CASH') {
      setSweepiesAmount(newAmount)
      setManaAmount(
        newAmount ? newAmount * CASH_TO_MANA_CONVERSION_RATE : undefined
      )
    } else {
      setManaAmount(newAmount)
      setSweepiesAmount(
        newAmount ? newAmount / CASH_TO_MANA_CONVERSION_RATE : undefined
      )
    }
  }

  const onSubmit = async () => {
    if (!sweepiesAmount) return
    setLoading(true)
    try {
      await api('convert-cash-to-mana', { amount: sweepiesAmount })
      setLoading(false)
      updateAmounts(sweepiesAmount, 'CASH')
      setError(null)
      onBack()
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
    }
  }

  return (
    <Col style={{ gap: 16, width: '100%' }}>
      <ThemedText size="md" style={{ marginBottom: 16 }}>
        Convert at a rate of {CASH_TO_MANA_CONVERSION_RATE} {SWEEPIES_NAME} to 1
        mana.
      </ThemedText>

      <Col style={{ gap: 8 }}>
        <ThemedText size="md" weight="semibold">
          Redeem
        </ThemedText>
        <AmountInput
          placeholder="Redeem Amount"
          amount={sweepiesAmount}
          min={0}
          onChangeAmount={(newAmount) => {
            if (newAmount && newAmount > roundedRedeemableCash) {
              updateAmounts(roundedRedeemableCash, 'CASH')
            } else {
              updateAmounts(newAmount, 'CASH')
            }
          }}
        />
      </Col>

      <Col style={{ gap: 8 }}>
        <ThemedText size="md" weight="semibold">
          For
        </ThemedText>
        <AmountInput
          placeholder="Mana Amount"
          amount={manaAmount}
          min={0}
          onChangeAmount={(newAmount) => updateAmounts(newAmount, 'MANA')}
        />
      </Col>

      <Row>
        <Button
          onPress={onSubmit}
          disabled={!manaAmount || !sweepiesAmount}
          loading={loading}
          style={{ flex: 1 }}
          size="lg"
        >
          <ThemedText size="md" weight="semibold">
            Redeem for {formatMoneyVerbatim(manaAmount ?? 0, 'MANA')}
          </ThemedText>
        </Button>
      </Row>

      {error && (
        <ThemedText color={Colors.error} size="sm">
          {error}
        </ThemedText>
      )}
    </Col>
  )
}

function AmountInput(props: {
  placeholder: string
  amount?: number
  min: number
  onChangeAmount: (amount: number | undefined) => void
}) {
  return (
    <Input
      placeholder={props.placeholder}
      value={props.amount?.toString()}
      onChangeText={(text) => {
        const num = parseFloat(text)
        props.onChangeAmount(isNaN(num) ? undefined : num)
      }}
      keyboardType="numeric"
      style={{
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: Rounded.lg,
        padding: 12,
      }}
    />
  )
}
