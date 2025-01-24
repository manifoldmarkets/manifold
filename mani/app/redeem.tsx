import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native'
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
import { ReactNode } from 'react'
import {
  formatSweepies,
  formatMoney,
  formatMoneyUSD,
  formatSweepsToUSD,
} from 'common/util/format'
import ManaFlatImage from '../assets/images/masses_mana_flat.png'
import CashIconImage from '../assets/images/masses_sweeps_flat.png'
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
import { amber, Colors, emerald, purple } from 'constants/colors'
import { Rounded } from 'constants/border-radius'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'
import Page from 'components/page'
import { Button } from 'components/buttons/button'
import { ContractToken } from 'common/contract'
import { TokenNumber } from 'components/token/token-number'

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
  const redeemable = useAPIGetter('get-redeemable-prize-cash', {})
  useEffect(() => {
    redeemable?.refresh()
  }, [user?.balance, user?.cashBalance])
  const redeemableCash = redeemable?.data?.redeemablePrizeCash ?? 0

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
          dollars: (1 - SWEEPIES_CASHOUT_FEE) * sweepCashAmount,
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
        <Text style={styles.title}>Redeem {SWEEPIES_NAME}</Text>
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
            <Col style={styles.messageContainer}>
              <Text style={styles.messageTitle}>Your location is blocked!</Text>
              <Text style={styles.messageText}>
                You are unable to redeem at the moment.
              </Text>
            </Col>
            <Button
              onPress={() => requestLocationThenFetchMonitorStatus()}
              disabled={loadingMonitorStatus}
            >
              <Text style={styles.buttonText}>Refresh status</Text>
            </Button>
            {monitorStatus === 'error' && (
              <Text style={styles.errorText}>{monitorStatusMessage}</Text>
            )}
          </Col>
        ) : ageBlocked(user, privateUser) ? (
          <Col style={styles.messageContainer}>
            <Text style={styles.messageTitle}>You must be 18+</Text>
            <Text style={styles.messageText}>
              You are unable to redeem at the moment.
            </Text>
          </Col>
        ) : PROMPT_USER_VERIFICATION_MESSAGES.includes(message) ? (
          <Col style={styles.verificationContainer}>
            <Col style={styles.messageContainer}>
              <Col style={styles.messageContent}>
                <Text style={styles.messageTitle}>
                  You're not verified yet...
                </Text>
                <Text style={styles.messageText}>
                  Verification is required to redeem {SWEEPIES_NAME}.
                </Text>
              </Col>
            </Col>
            <Button
              onPress={() => router.push('/register')}
              variant="emerald"
              size="lg"
            >
              <Text style={styles.buttonText}>
                Verify and get {KYC_VERIFICATION_BONUS_CASH} {SWEEPIES_NAME}
              </Text>
            </Button>
            <Text style={styles.disclaimerText}>
              Only for eligible US residents
            </Text>
          </Col>
        ) : fraudSession(user, privateUser) ? (
          <Col style={styles.messageContainer}>
            <Col style={styles.messageContent}>
              <Text style={styles.messageTitle}>
                Suspicious activity detected
              </Text>
              <Text style={styles.messageText}>
                Your session is marked as possible fraud, please turn off VPN if
                using.
              </Text>
              <Button
                onPress={() => requestLocationThenFetchMonitorStatus()}
                disabled={loadingMonitorStatus}
              >
                <Text style={styles.buttonText}>Refresh status</Text>
              </Button>
              {monitorStatus === 'error' && (
                <Text style={styles.errorText}>{monitorStatusMessage}</Text>
              )}
            </Col>
          </Col>
        ) : identityBlocked(user, privateUser) ? (
          <Col style={styles.messageContainer}>
            <Col style={styles.messageContent}>
              <Text style={styles.messageTitle}>Your identity is blocked</Text>
              <Text style={styles.messageText}>
                You cannot participate in sweepstakes market.
              </Text>
            </Col>
          </Col>
        ) : failedDocs && mustUploadDocs ? (
          <UploadDocuments
            back={router.back}
            next={() => setFailedDocs(false)}
            requireUtilityDoc={true}
          />
        ) : documentPending(user, privateUser) ? (
          <Col style={styles.messageContainer}>
            <Col style={styles.messageContent}>
              <Text style={styles.messageTitle}>
                Identity documents pending
              </Text>
              <Text style={styles.messageText}>
                You are unable to redeem at the moment.
              </Text>
            </Col>
          </Col>
        ) : (
          <Col style={styles.messageContainer}>
            <Col style={styles.messageContent}>
              <Text style={styles.messageTitle}>Redemptions unavailable</Text>
              <Text style={styles.messageText}>
                You are unable to redeem at the moment.
              </Text>
            </Col>
          </Col>
        )}
        <SweepiesStats
          redeemableCash={redeemableCash}
          cashBalance={user.cashBalance}
          style={styles.stats}
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
      <Text style={styles.title}>Redeem {SWEEPIES_NAME}</Text>
      <SweepiesStats
        redeemableCash={redeemableCash}
        cashBalance={user.cashBalance}
        style={styles.stats}
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
          <Col style={styles.formContainer}>
            <Col style={styles.formRow}>
              <Text style={styles.formLabel}>Redeem</Text>
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
                <Text style={styles.errorText}>
                  The minimum redeemable amount is{' '}
                  {formatSweepies(MIN_CASHOUT_AMOUNT)}
                </Text>
              )}
            </Col>
            <Col style={styles.formRow}>
              <Text style={styles.formLabel}>Name</Text>
              <Input
                placeholder="Name associated with account"
                value={NameOnAccount}
                onChangeText={setNameOnAccount}
                style={styles.input}
              />
            </Col>
            <Col style={styles.formRow}>
              <Text style={styles.formLabel}>Account Number</Text>
              <Input
                keyboardType="numeric"
                placeholder="Your account #"
                value={AccountNumber}
                onChangeText={setAccountNumber}
                style={styles.input}
              />
            </Col>
            <Col style={styles.formRow}>
              <Text style={styles.formLabel}>Routing Number</Text>
              <Input
                keyboardType="numeric"
                placeholder="Your bank's routing #"
                value={RoutingNumber}
                onChangeText={setRoutingNumber}
                style={styles.input}
              />
            </Col>
            <Col style={styles.formRow}>
              <Text style={styles.formLabel}>Billing Address</Text>
              <Input
                placeholder="Billing Address"
                value={address}
                onChangeText={setAddress}
                style={styles.input}
              />
            </Col>
            <Col style={styles.formRow}>
              <Text style={styles.formLabel}>City</Text>
              <Input
                placeholder="Your city"
                value={city}
                onChangeText={setCity}
                style={styles.input}
              />
            </Col>
            <Col style={styles.formRow}>
              <Text style={styles.formLabel}>State</Text>
              <Input
                placeholder="Your state"
                value={state}
                onChangeText={setState}
                style={styles.input}
              />
            </Col>
            <Col style={styles.formRow}>
              <Text style={styles.formLabel}>Postal Code</Text>
              <Input
                keyboardType="numeric"
                placeholder="Your postal code"
                value={zipCode}
                onChangeText={setZipCode}
                style={styles.input}
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
                style={styles.wideButton}
              >
                <Text style={styles.buttonText}>
                  Redeem for{' '}
                  {formatSweepsToUSD(
                    (1 - SWEEPIES_CASHOUT_FEE) * (sweepCashAmount ?? 0)
                  )}
                </Text>
              </Button>
            </Row>
          </Col>
        )
      )}
      {page === 'waiting' && (
        <Text style={styles.waitingText}>
          Your redemption request is being processed. We'll notify you in 3-5
          business days once it's approved.
        </Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {sessionStatus && sessionStatus.toLowerCase().includes('timeout') && (
        <Text style={styles.errorText}>
          {sessionStatus} - refresh to try again
        </Text>
      )}
    </Page>
  )
}

function SweepiesStats(props: {
  redeemableCash: number
  cashBalance: number
  style?: any
}) {
  const { redeemableCash, cashBalance } = props
  return (
    <Col style={[styles.stats, props.style]}>
      <Row style={styles.statsRow}>
        <Text style={styles.statsLabel}>Redeemable</Text>
        <TokenNumber
          amount={redeemableCash}
          style={styles.statsAmount}
          token="CASH"
        />
      </Row>
      <View style={styles.statsSeparator} />
      <Row style={styles.statsRow}>
        <Text style={styles.statsLabel}>Total</Text>
        <TokenNumber
          amount={cashBalance}
          style={styles.statsAmount}
          token="CASH"
        />
      </Row>
    </Col>
  )
}

function CashoutOptionsExplainer() {
  return (
    <View>
      <Text style={styles.explainerTitle}>
        Prizes you can win by playing in our sweepstakes questions!
      </Text>
      <Text style={styles.explainerText}>Must be a US Resident. 18+ only.</Text>
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

  return (
    <Col style={styles.cashoutOptionsContainer}>
      <Card>
        <Row style={styles.cardContent}>
          <Image
            source={ManaFlatImage}
            style={[styles.cardIcon, allDisabled && styles.grayscale]}
          />
          <Col style={styles.cardDescription}>
            <Text style={styles.cardTitle}>Get Mana</Text>
            <Text style={styles.cardText}>
              Redeem {SWEEPIES_NAME} at{' '}
              <Text style={styles.boldText}>
                {formatSweepies(1)} →{' '}
                {formatMoney(CASH_TO_MANA_CONVERSION_RATE)}
              </Text>
            </Text>
            <Button
              variant="purple"
              onPress={() => setPage('custom-mana')}
              disabled={!!allDisabled || hasNoRedeemableCash}
              size="lg"
            >
              <Text>Redeem for mana</Text>
            </Button>
            <Row style={styles.valueRow}>
              <TokenNumber
                amount={redeemableCash * CASH_TO_MANA_CONVERSION_RATE}
                style={[
                  styles.valueText,
                  !allDisabled && {
                    color: purple[400],
                  },
                ]}
                token="MANA"
              />
              <Text style={styles.valueLabel}>mana value</Text>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card>
        <Row style={styles.cardContent}>
          <Image
            source={CashIconImage}
            style={[styles.cardIcon, allDisabled && styles.grayscale]}
          />
          <Col style={styles.cardDescription}>
            <Text style={styles.cardTitle}>Redeem for USD</Text>
            <Text style={styles.cardText}>
              Redeem {SWEEPIES_NAME} at{' '}
              <Text style={styles.boldText}>
                {formatSweepies(1)} → {formatMoneyUSD(1)}
              </Text>
              , minus a {SWEEPIES_CASHOUT_FEE * 100}% fee.
            </Text>
            <Button
              onPress={() => setPage(redeemForUSDPageName)}
              disabled={
                !!allDisabled ||
                noHasMinRedeemableCash ||
                !TWOMBA_CASHOUT_ENABLED
              }
              size="lg"
            >
              <Text style={styles.buttonText}>Redeem for USD</Text>
            </Button>
            {!TWOMBA_CASHOUT_ENABLED && (
              <Text style={styles.disabledText}>
                Cashouts should be enabled in less than a week
              </Text>
            )}
            <Row style={styles.valueRow}>
              {noHasMinRedeemableCash && !allDisabled ? (
                <Row style={{ alignItems: 'center' }}>
                  <Text style={styles.errorText}>You need at least </Text>
                  <TokenNumber
                    amount={MIN_CASHOUT_AMOUNT}
                    token="CASH"
                    style={[
                      styles.valueText,
                      {
                        color: amber[500],
                      },
                    ]}
                  />
                  <Text style={styles.errorText}> to redeem</Text>
                </Row>
              ) : (
                <>
                  <Text
                    style={[
                      styles.valueText,
                      !allDisabled && {
                        color: emerald[400],
                      },
                    ]}
                  >
                    ${((1 - SWEEPIES_CASHOUT_FEE) * redeemableCash).toFixed(2)}
                  </Text>
                  <Text style={styles.valueLabel}>value</Text>
                </>
              )}
            </Row>
          </Col>
        </Row>
      </Card>
    </Col>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>
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
    <Col style={styles.formContainer}>
      <Text style={styles.conversionText}>
        Convert at a rate of {CASH_TO_MANA_CONVERSION_RATE} {SWEEPIES_NAME} to 1
        mana.
      </Text>

      <Col style={styles.formRow}>
        <Text style={styles.formLabel}>Redeem</Text>
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

      <Col style={styles.formRow}>
        <Text style={styles.formLabel}>For</Text>
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
          style={styles.wideButton}
          size="lg"
        >
          <Text style={styles.buttonText}>
            Redeem for {formatMoney(manaAmount ?? 0)} mana
          </Text>
        </Button>
      </Row>

      {error && <Text style={styles.errorText}>{error}</Text>}
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
      style={styles.input}
    />
  )
}
const baseText = {
  fontSize: 14,
  color: Colors.text,
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  baseText,
  title: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  messageContainer: {
    marginBottom: 24,
  },
  messageContent: {
    gap: 4,
  },
  messageTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  buttonText: {
    color: Colors.text,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
  verificationContainer: {
    marginBottom: 16,
    gap: 16,
  },
  disclaimerText: {
    ...baseText,
    marginTop: 4,
    textAlign: 'center',
  },
  stats: {
    marginBottom: 24,
  },
  statsRow: {
    alignItems: 'center',
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  statsLabel: {
    fontSize: 16,
    color: Colors.textSecondary,
    flex: 1,
  },
  statsAmount: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
  },
  statsSeparator: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  formContainer: {
    gap: 16,
    width: '100%',
  },
  formRow: {
    gap: 8,
  },
  formLabel: {
    ...baseText,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Rounded.lg,
    padding: 12,
  },
  waitingText: {
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  explainerTitle: {
    ...baseText,
    marginBottom: 8,
  },
  explainerText: {
    ...baseText,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  cashToManaTitle: {
    ...baseText,
    color: Colors.text,
    marginBottom: 8,
  },
  cashoutOptionsContainer: {
    gap: 16,
    width: '100%',
  },
  card: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: Rounded.lg,
    padding: 16,
    marginBottom: 16,
  },
  cardContent: {
    gap: 16,
  },
  cardIcon: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
  },
  cardDescription: {
    flex: 1,
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  cardText: {
    ...baseText,
    color: Colors.textSecondary,
  },
  boldText: {
    fontWeight: '600',
  },
  wideButton: {
    flex: 1,
  },
  disabledButton: {
    opacity: 0.5,
  },
  valueRow: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlignVertical: 'center',
  },
  valueLabel: {
    ...baseText,
    color: Colors.textSecondary,
  },
  disabledText: {
    ...baseText,
    color: Colors.textSecondary,
  },
  grayscale: {
    opacity: 0.5,
  },
  conversionText: {
    ...baseText,
    marginBottom: 16,
  },
})
