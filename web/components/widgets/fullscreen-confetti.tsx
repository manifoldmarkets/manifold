import Confetti, { Props as ConfettiProps } from 'react-confetti'
import { useWindowSize } from 'web/hooks/use-window-size'

export function FullscreenConfetti(
  props: Exclude<ConfettiProps, 'width' | 'height'>
) {
  const { width = 500, height = 500 } = useWindowSize()
  return <Confetti {...props} width={width} height={height} />
}
