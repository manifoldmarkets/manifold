import { useState, useEffect } from 'react'
import { View, StyleSheet, ActivityIndicator, Image } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { ThemedText } from 'components/themed-text'
import { useUser, usePrivateUser } from 'hooks/use-user'
import { Colors } from 'constants/colors'
import { PaymentAmount } from 'common/economy'
import { getVerificationStatus } from 'common/gidx/user'
import { api } from 'lib/api'
import { CheckoutSession, GPSData } from 'common/gidx/gidx'
import { LocationPanel } from 'components/location-panel'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { Input } from 'components/widgets/input'
import { Button } from 'components/buttons/button'
import { TokenNumber } from 'components/token/token-number'
import { capitalize } from 'lodash'
import Page from 'components/page'
import dark1 from '../assets/images/payment-icons/dark/1.png'
import dark2 from '../assets/images/payment-icons/dark/2.png'
import dark14 from '../assets/images/payment-icons/dark/14.png'
import dark22 from '../assets/images/payment-icons/dark/22.png'
import manachan from '../assets/images/manachan.png'
import crane from '../assets/images/crane.png'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'

export default function CheckoutPage() {
  const user = useUser()
  const privateUser = usePrivateUser()
  const { priceInDollars } = useLocalSearchParams<{ priceInDollars?: string }>()
  const [deviceGPS, setDeviceGPS] = usePersistentInMemoryState<
    GPSData | undefined
  >(undefined, 'deviceGPS')
  const [page, setPage] = useState<'location' | 'payment' | 'get-session'>(
    !deviceGPS ? 'location' : 'get-session'
  )
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>()
  const [productSelected, setProductSelected] = useState<PaymentAmount>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string>()

  useEffect(() => {
    if (!user || !privateUser || !priceInDollars) return
    checkIfRegistered()
  }, [user?.id, privateUser?.id, priceInDollars])

  const checkIfRegistered = async () => {
    if (!user || !privateUser || !priceInDollars) return
    setError(null)
    setLoading(true)
    if (!user.idVerified) {
      router.push('/register')
      return
    }
    const { status, message } = getVerificationStatus(user, privateUser)
    if (status !== 'error') {
      setPage('location')
    } else {
      setError(message)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (deviceGPS) {
      getCheckoutSession(deviceGPS)
      if (page === 'location') setPage('get-session')
    }
  }, [deviceGPS])

  const getCheckoutSession = async (data: GPSData) => {
    if (!priceInDollars) return
    setError(null)
    setLoading(true)
    try {
      const res = await api('get-checkout-session-gidx', {
        DeviceGPS: data,
      })
      const { session, status, message } = res
      if (session && status !== 'error') {
        const product = session.PaymentAmounts.find(
          (a) => a.priceInDollars === Number(priceInDollars)
        )
        if (!product) {
          setError(
            "We couldn't find that product, please ping us in discord or choose another!"
          )
          return
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

  if (!user || !privateUser || !priceInDollars) {
    return (
      <Page>
        <View style={styles.container}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </Page>
    )
  }

  return (
    <Page>
      <View style={styles.container}>
        {page === 'location' && !deviceGPS ? (
          <LocationPanel
            location={deviceGPS}
            setLocation={setDeviceGPS}
            setLocationError={setLocationError}
            setLoading={setLoading}
            loading={loading}
            locationError={locationError}
            back={router.back}
          />
        ) : page === 'payment' && checkoutSession && productSelected ? (
          <PaymentSection
            CheckoutSession={checkoutSession}
            amount={productSelected}
          />
        ) : !error ? (
          <Col style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.blue} />
          </Col>
        ) : null}
        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
      </View>
    </Page>
  )
}

function PaymentSection(props: {
  CheckoutSession: CheckoutSession
  amount: PaymentAmount
}) {
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

  const handleSubmit = async () => {
    if (
      !name ||
      !cardNumber ||
      !expiryDate ||
      !cvv ||
      !address ||
      !city ||
      !state ||
      !zipCode
    )
      return

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
      return { status: 'error', message: e.message }
    })
    setLoading(false)
    if (res.status !== 'success') {
      setError(res.message ?? 'Error completing checkout session')
    } else {
      setComplete(true)
    }
  }

  const handleExpiryDateChange = (value: string) => {
    if (value.length > 5) return
    const isBackspace = value.length < expiryDate.length
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
      <Col style={styles.completeContainer}>
        <ThemedText style={styles.completeTitle}>
          🎉 Purchase Complete 🎉
        </ThemedText>
        <Image
          source={manachan}
          style={{
            width: 150,
            height: 150,
            resizeMode: 'contain',
            borderRadius: 100,
          }}
        />
        <ThemedText style={styles.completeText}>
          May the trades be ever in your favor.
        </ThemedText>
      </Col>
    )
  }

  return (
    <Col style={styles.paymentContainer}>
      <Image
        source={crane}
        style={{
          width: 150,
          height: 150,
          resizeMode: 'contain',
        }}
      />
      <Row style={[styles.amountRow]}>
        <TokenNumber size="lg" amount={amount.mana} token="MANA" />
        {amount.bonusInDollars ? (
          <>
            <ThemedText> + </ThemedText>
            <TokenNumber
              size="lg"
              amount={amount.bonusInDollars}
              token="CASH"
            />
          </>
        ) : null}
      </Row>

      <Col style={styles.formContainer}>
        <Input placeholder="Full Name" value={name} onChangeText={setName} />
        <Row style={{ position: 'relative' }}>
          <Input
            placeholder="1234 1234 1234 1234"
            value={cardNumber}
            onChangeText={setCardNumber}
            keyboardType="numeric"
            style={{ width: '100%' }}
          />
          <Row style={{ position: 'absolute', right: 10, top: 17, gap: 4 }}>
            <Image style={styles.paymentIcon} source={dark1} />
            <Image style={styles.paymentIcon} source={dark2} />
            <Image style={styles.paymentIcon} source={dark14} />
            <Image style={styles.paymentIcon} source={dark22} />
          </Row>
        </Row>
        <Row style={styles.cardRow}>
          <Input
            placeholder="MM/YY"
            value={expiryDate}
            onChangeText={handleExpiryDateChange}
            style={styles.halfInput}
            keyboardType="numeric"
          />
          <Input
            placeholder="CVV"
            value={cvv}
            onChangeText={setCvv}
            style={styles.halfInput}
            keyboardType="numeric"
          />
        </Row>
        <Input
          placeholder="Billing Address"
          value={address}
          onChangeText={setAddress}
        />
        <Row style={styles.addressRow}>
          <Input
            placeholder="City"
            value={city}
            onChangeText={setCity}
            style={styles.cityInput}
          />
          <Input
            placeholder="State"
            value={state}
            onChangeText={setState}
            style={styles.stateInput}
          />
          <Input
            placeholder="ZIP"
            value={zipCode}
            onChangeText={setZipCode}
            style={styles.zipInput}
            keyboardType="numeric"
          />
        </Row>
        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
        <Button
          size="lg"
          onPress={handleSubmit}
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
          title="Complete purchase"
        />
      </Col>
    </Col>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentContainer: {
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    gap: 16,
  },
  amountRow: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginVertical: 16,
  },
  cardRow: {
    gap: 16,
  },
  addressRow: {
    gap: 16,
  },
  halfInput: {
    flex: 1,
  },
  cityInput: {
    flex: 2,
  },
  stateInput: {
    flex: 1,
  },
  zipInput: {
    flex: 1,
  },
  errorText: {
    color: Colors.error,
    textAlign: 'center',
    marginTop: 8,
  },
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  completeText: {
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  paymentIcon: {
    width: 24,
    height: 16,
    resizeMode: 'contain',
  },
})
