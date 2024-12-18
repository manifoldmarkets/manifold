import { useColor } from 'hooks/useColor'
import { useTokenMode } from 'hooks/useTokenMode'
import { Row } from './row'
import { ThemedText } from 'components/ThemedText'
import { TokenSlider } from 'components/TokenSlider'
import { usePathname, useRouter } from 'expo-router'
import { IconSymbol } from 'components/ui/IconSymbol'
import { TouchableOpacity } from 'react-native'
import { isTabPath } from 'components/Page'

export function SliderHeader() {
  const color = useColor()
  const { mode } = useTokenMode()
  const pathname = usePathname()
  const router = useRouter()

  // Check if we're in a tab route - should match paths like /(tabs)/live, /(tabs)/profile, etc.
  const isInTabs = isTabPath(pathname)

  return (
    <Row
      style={{
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 20,
        backgroundColor: color.background,
      }}
    >
      {!isInTabs && (
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={24} color={color.textTertiary} />
        </TouchableOpacity>
      )}

      <Row
        style={{
          marginLeft: 'auto',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <ThemedText color={color.primary} family={'JetBrainsMono'} size="md">
          <ThemedText weight={'bold'} color={color.primary}>
            0{' '}
          </ThemedText>
          {mode === 'play' ? 'Mana' : 'Sweep'}
        </ThemedText>
        <TokenSlider />
      </Row>
    </Row>
  )
}
