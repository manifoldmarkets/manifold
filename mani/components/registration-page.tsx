import { usePrivateUser, useUser } from 'hooks/use-user'
import { useState } from 'react'
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { Text } from 'components/text'
import { Button } from 'components/buttons/button'
import { api } from 'lib/api'
import { useRouter } from 'expo-router'
import { Colors } from 'constants/colors'
import { KYC_VERIFICATION_BONUS_CASH } from 'common/economy'
import { GPSData } from 'common/gidx/gidx'
import { RegistrationVerifyPhone } from 'components/registration-verify-phone'
import { LocationPanel } from 'components/location-panel'
import { UploadDocuments } from 'components/upload-document'
import { CheckBox } from './checkbox'
import { Input } from './widgets/input'
import {
  fraudSession,
  locationBlocked,
  identityBlocked,
  documentPending,
  ageBlocked,
  documentsFailed,
} from 'common/gidx/user'
import { PrivateUser, User } from 'common/user'

export const RegistrationPage = (props: {
  user: User
  privateUser: PrivateUser
}) => {
  const user = useUser() ?? props.user
  const privateUser = usePrivateUser() ?? props.privateUser
  const router = useRouter()
  const [page, setPage] = useState(
    user?.idVerified ||
      user?.kycDocumentStatus === 'pending' ||
      user?.kycDocumentStatus === 'fail'
      ? 'final'
      : 'intro'
  )

  const [loading, setLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [identityErrors, setIdentityErrors] = useState(0)

  const [userInfo, setUserInfo] = useState<{
    FirstName?: string
    LastName?: string
    DateOfBirth?: string
    AddressLine1?: string
    AddressLine2?: string
    City?: string
    StateCode?: string
    PostalCode?: string
    DeviceGPS?: GPSData
    EmailAddress?: string
    ReferralCode?: string
  }>({
    FirstName: user?.name.split(' ')[0],
    LastName: user?.name.split(' ')[1],
    DateOfBirth: undefined,
    EmailAddress: privateUser?.email,
  })

  const requiredKeys = [
    'FirstName',
    'LastName',
    'DateOfBirth',
    'AddressLine1',
    'City',
    'PostalCode',
    'DeviceGPS',
    'EmailAddress',
  ] as const

  const unfilled = requiredKeys.filter((key) => !userInfo[key])

  const register = async () => {
    setError(null)
    setLoading(true)
    if (!userInfo.DeviceGPS) {
      setLoading(false)
      setError('Location is required.')
      return
    }
    if (unfilled.length) {
      setLoading(false)
      setError(`Missing fields: ${unfilled.map(([key]) => key).join(', ')}`)
      return
    }
    const res = await api('register-gidx', {
      MerchantCustomerID: user?.id,
      ...userInfo,
    } as any).catch((e) => {
      setError(e.message)
      setLoading(false)
      return null
    })
    if (!res) return

    const { status, message, idVerified } = res
    setLoading(false)

    // Handle specific error cases
    if (message && status === 'error') {
      if (!user || !privateUser) {
        setError('Please sign in to continue.')
        return
      }

      if (fraudSession(user, privateUser)) {
        setError(
          'Your current activity was marked as suspicious. Please turn off VPN if using. You may have to wait for a few hours for your account to be unblocked.'
        )
        return
      }

      if (locationBlocked(user, privateUser)) {
        setError(
          'Your location is not eligible for sweepstakes participation. This could be due to state regulations or rapid location changes.'
        )
        return
      }

      if (identityBlocked(user, privateUser)) {
        setError(
          'We were unable to verify your identity. Please ensure all information is accurate.'
        )
        return
      }

      if (documentPending(user, privateUser)) {
        setError(
          'Your document verification is pending. Please check back later.'
        )
        setPage('final')
        return
      }

      if (ageBlocked(user, privateUser)) {
        setError('You must be 18 or older to participate in sweepstakes.')
        return
      }

      if (documentsFailed(user, privateUser)) {
        if (identityErrors >= 2 && page !== 'documents') {
          setPage('documents')
        }
        setIdentityErrors(identityErrors + 1)
        setError(
          'Document verification failed. Please try uploading your documents again.'
        )
        return
      }

      // Generic error case
      setError(message)
      return
    }

    // Identity verification succeeded
    setPage('final')
  }

  const [canContinue, setCanContinue] = useState(false)

  if (page === 'intro') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Identity Verification</Text>
          <View style={styles.infoContainer}>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                To participate in sweepstakes and comply with U.S. laws, you
                must verify your identity.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                Manifold uses a verification platform to validate your name,
                phone number, birthday, and address.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                Your info is confidential, securely protected, and used solely
                for regulatory purposes.
              </Text>
            </View>
          </View>
          <View style={styles.checkboxContainer}>
            <CheckBox
              checked={canContinue}
              onPress={() => setCanContinue(!canContinue)}
              label="I am a resident of the United States (excluding DE, ID, MI, and WA) and over 18 years old."
            />
          </View>
          <View style={styles.buttonRow}>
            <Button
              onPress={() => router.push('/home')}
              title="Cancel"
              variant="gray"
            />
            <Button
              onPress={() => setPage('phone')}
              title="Start verification"
              disabled={!canContinue}
            />
          </View>
        </View>
      </ScrollView>
    )
  }

  if (page === 'phone') {
    return (
      <RegistrationVerifyPhone
        cancel={() => setPage('intro')}
        next={() => setPage('location')}
      />
    )
  }

  if (page === 'location') {
    return (
      <LocationPanel
        setLocation={(data: GPSData) => {
          setUserInfo({
            ...userInfo,
            DeviceGPS: data,
          })
          setPage('user-info-form')
        }}
        setLocationError={setLocationError}
        setLoading={setLoading}
        loading={loading}
        locationError={locationError}
        back={() => (user?.verifiedPhone ? setPage('intro') : setPage('phone'))}
      />
    )
  }

  if (page === 'user-info-form') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Identity</Text>
          <View style={styles.formRow}>
            <View style={styles.formColumn}>
              <Text style={styles.label}>First Name</Text>
              <Input
                value={userInfo.FirstName}
                onChangeText={(text) =>
                  setUserInfo({ ...userInfo, FirstName: text })
                }
                placeholder="First Name"
              />
            </View>
            <View style={styles.formColumn}>
              <Text style={styles.label}>Last Name</Text>
              <Input
                value={userInfo.LastName}
                onChangeText={(text) =>
                  setUserInfo({ ...userInfo, LastName: text })
                }
                placeholder="Last Name"
              />
            </View>
          </View>
          <View style={styles.formField}>
            <Text style={styles.label}>Date of Birth</Text>
            <Input
              value={userInfo.DateOfBirth}
              onChangeText={(text) =>
                setUserInfo({ ...userInfo, DateOfBirth: text })
              }
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.formField}>
            <Text style={styles.label}>Email Address</Text>
            <Input
              value={userInfo.EmailAddress}
              onChangeText={(text) =>
                setUserInfo({ ...userInfo, EmailAddress: text })
              }
              placeholder="Email"
              keyboardType="email-address"
            />
          </View>
          <View style={styles.buttonRow}>
            <Button onPress={() => setPage('location')} title="Back" />
            <Button
              onPress={() => setPage('user-address-form')}
              title="Next"
              disabled={
                !userInfo.FirstName ||
                !userInfo.LastName ||
                !userInfo.DateOfBirth ||
                !userInfo.EmailAddress
              }
            />
          </View>
        </View>
      </ScrollView>
    )
  }

  if (page === 'user-address-form') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Address</Text>
          <View style={styles.formField}>
            <Text style={styles.label}>Address Line 1</Text>
            <Input
              value={userInfo.AddressLine1}
              onChangeText={(text) =>
                setUserInfo({ ...userInfo, AddressLine1: text })
              }
              placeholder="Street Address"
            />
          </View>
          <View style={styles.formField}>
            <Text style={styles.label}>Address Line 2 (Optional)</Text>
            <Input
              value={userInfo.AddressLine2}
              onChangeText={(text) =>
                setUserInfo({ ...userInfo, AddressLine2: text })
              }
              placeholder="Apt, Suite, etc."
            />
          </View>
          <View style={styles.formField}>
            <Text style={styles.label}>City</Text>
            <Input
              value={userInfo.City}
              onChangeText={(text) => setUserInfo({ ...userInfo, City: text })}
              placeholder="City"
            />
          </View>
          <View style={styles.formRow}>
            <View style={styles.formColumn}>
              <Text style={styles.label}>State</Text>
              <Input
                value={userInfo.StateCode}
                onChangeText={(text) =>
                  setUserInfo({ ...userInfo, StateCode: text })
                }
                placeholder="State"
              />
            </View>
            <View style={styles.formColumn}>
              <Text style={styles.label}>Postal Code</Text>
              <Input
                value={userInfo.PostalCode}
                onChangeText={(text) =>
                  setUserInfo({ ...userInfo, PostalCode: text })
                }
                placeholder="ZIP"
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.formField}>
            <Text style={styles.label}>Referral Code (Optional)</Text>
            <Input
              value={userInfo.ReferralCode}
              onChangeText={(text) =>
                setUserInfo({ ...userInfo, ReferralCode: text })
              }
              placeholder="R2I3E"
            />
          </View>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <View style={styles.buttonRow}>
            <Button
              onPress={() => setPage('user-info-form')}
              title="Back"
              disabled={loading}
            />
            <Button
              onPress={register}
              title="Submit"
              loading={loading}
              disabled={loading || unfilled.length > 0}
            />
          </View>
        </View>
      </ScrollView>
    )
  }

  if (page === 'documents') {
    return (
      <UploadDocuments
        back={() => router.back()}
        next={() => setPage('final')}
        requireUtilityDoc={false}
      />
    )
  }
  if (page === 'final' && user?.idVerified) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Identity Verification Complete!</Text>
          <Text style={styles.message}>
            Hooray! Now you can participate in sweepstakes markets. We sent you
            ${KYC_VERIFICATION_BONUS_CASH / 100} to get started.
          </Text>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.blue} />
            <Text style={styles.loadingText}>
              Exiting through the gift shop...
            </Text>
          </View>
        </View>
      </View>
    )
  }

  return null
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
  infoContainer: {
    marginBottom: 24,
  },
  infoRow: {
    marginBottom: 16,
  },
  infoText: {
    fontSize: 16,
    lineHeight: 24,
  },
  checkboxContainer: {
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  formColumn: {
    flex: 1,
  },
  formField: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
    fontWeight: '500',
  },
  errorContainer: {
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
  },
  emoji: {
    fontSize: 72,
    textAlign: 'center',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 16,
  },
})
