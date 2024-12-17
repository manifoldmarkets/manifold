import { useColor } from 'hooks/useColor'
import { useTokenMode } from 'hooks/useTokenMode'
import { Row } from './row'
import { ThemedText } from 'components/ThemedText'
import { TokenSlider } from 'components/TokenSlider'

export function SliderHeader() {
  const color = useColor()
  const { mode } = useTokenMode()
  console.log('MODE', mode)
  return (
    <Row
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        width: '100%',
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
  )
}
