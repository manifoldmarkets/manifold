import { useEffect, useState } from 'react'
import { View, StyleSheet, TextInput } from 'react-native'
import { Text } from 'components/text'
import { Button } from 'components/buttons/button'
import { useUser } from 'hooks/use-user'
import { api } from 'lib/api'
import { Colors } from 'constants/colors'
import { PhoneInput } from 'components/phone-input'

export function RegistrationVerifyPhone(props: {
  cancel: () => void
  next: () => void
}) {
  const { next, cancel } = props
  const user = useUser()
  const requestOTP = async () => {
    setLoading(true)
    try {
      await api('request-otp', {
        phoneNumber,
      })
      setPage(1)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const verifyPhone = async () => {
    setLoading(true)
    try {
      await api('verify-phone-number', {
        phoneNumber,
        code: otp,
      })
      next()
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (user?.verifiedPhone) next()
  }, [user?.verifiedPhone])

  return (
    <View style={styles.container}>
      {page === 0 && (
        <View style={styles.content}>
          <Text style={styles.title}>Verify your phone number</Text>
          <Text style={styles.subtitle}>
            We won't use your phone number for anything other than verification.
          </Text>
          <PhoneInput value={phoneNumber} onChangeText={setPhoneNumber} />
          <View style={styles.buttonRow}>
            <Button onPress={cancel} title="Back" variant="gray" />
            <Button
              disabled={phoneNumber.length < 7 || loading}
              loading={loading}
              onPress={requestOTP}
              title="Request code"
            />
          </View>
        </View>
      )}
      {page === 1 && (
        <View style={styles.content}>
          <Text style={styles.title}>Enter verification code</Text>
          <TextInput
            style={styles.otpInput}
            value={otp}
            onChangeText={setOtp}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
          />
          <View style={styles.buttonRow}>
            <Button onPress={() => setPage(0)} title="Back" variant="gray" />
            <Button
              disabled={otp.length < 6 || loading}
              loading={loading}
              onPress={verifyPhone}
              title="Verify"
            />
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: Colors.textSecondary,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 24,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
})
