import { ThemedText } from 'components/ThemedText'
import { ThemedView } from 'components/ThemedView'
import { Link, Stack } from 'expo-router'
import { StyleSheet } from 'react-native'

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <ThemedView style={styles.container}>
        <ThemedText>This screen doesn't exist.</ThemedText>
        <Link href="/" style={styles.link}>
          <ThemedText>Go to home screen!</ThemedText>
        </Link>
      </ThemedView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
})
