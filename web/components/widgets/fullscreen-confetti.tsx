import Confetti, { Props as ConfettiProps } from 'react-confetti'
import { useWindowSize } from 'web/hooks/use-window-size'

export function FullscreenConfetti(props: ConfettiProps) {
  const { width, height } = useWindowSize()
  return <Confetti {...props} width={width} height={height} />
}
