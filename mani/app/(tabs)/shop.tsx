import Page from 'components/page'
import { ThemedText } from 'components/themed-text'
import { useUser } from 'hooks/use-user'
import { useRouter } from 'expo-router'
import { Button } from 'components/buttons/button'
import { View, StyleSheet } from 'react-native'

export default function Shop() {
  const user = useUser()
  const router = useRouter()

  if (!user?.idVerified) {
    return (
      <Page>
        <View style={styles.container}>
          <ThemedText style={styles.title}>
            Identity Verification Required
          </ThemedText>
          <ThemedText style={styles.message}>
            To participate in sweepstakes and access the shop, you need to
            verify your identity first.
          </ThemedText>
          <Button
            title="Start Verification"
            onPress={() => router.push('/registration')}
          />
        </View>
      </Page>
    )
  }

  return (
    <Page>
      <ThemedText>Shop Content Here</ThemedText>
    </Page>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
})
