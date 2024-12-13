import Page from 'components/Page'
import { ThemedText } from 'components/ThemedText'
import { ThemedView } from 'components/ThemedView'
import { useColor } from 'hooks/useColor'
import { Platform, StyleSheet } from 'react-native'

export default function HomeScreen() {
  const color = useColor()
  return (
    <Page>
      <ThemedView style={styles.titleContainer}>
        <ThemedText family="JetBrainsMono" size="3xl" weight="bold">
          Welcome!
        </ThemedText>
        {/* <HelloWave /> */}
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText size={'xs'} weight={'bold'} family={'JetBrainsMono'}>
          Step 001: Try it
        </ThemedText>
        <ThemedText weight="thin" family={'JetBrainsMono'} italics>
          Step 001: Try it
        </ThemedText>
        <ThemedText weight="bold" family={'JetBrainsMono'} italics>
          Step 001: Try it
        </ThemedText>
        <ThemedText weight="semibold" family={'JetBrainsMono'} italics>
          Step 001: Try it
        </ThemedText>
        <ThemedText weight="semibold" italics>
          Step 001: Try it
        </ThemedText>
        <ThemedText weight="thin" italics>
          Step 001: Try it
        </ThemedText>
        <ThemedText size={'xs'} weight={'bold'} family={'JetBrainsMono'}>
          Step 1: Try it
        </ThemedText>
        <ThemedText size={'3xl'} weight={'bold'} family={'JetBrainsMono'}>
          Edit <ThemedText>app/(tabs)/index.tsx</ThemedText> to see changes.
          Press{' '}
          <ThemedText>
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12',
            })}
          </ThemedText>{' '}
          to open developer tools. SDFSDFDSFLKDJ
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText>Step 2: Explore</ThemedText>
        <ThemedText>
          Tap the Explore tab to learn more about what's included in this
          starter app.
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText>Step 3: Get a fresh start</ThemedText>
        <ThemedText>
          When you're ready, run <ThemedText>npm run reset-project</ThemedText>{' '}
          to get a fresh <ThemedText>app</ThemedText> directory. This will move
          the current <ThemedText>app</ThemedText> to{' '}
          <ThemedText>app-example</ThemedText>.
        </ThemedText>
      </ThemedView>
    </Page>
  )
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
})
