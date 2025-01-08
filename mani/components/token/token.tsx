import { useTokenMode } from 'hooks/use-token-mode'
import { Image, ImageProps } from 'react-native'
import manaImage from 'assets/images/masses_mana.png'
import sweepsImage from 'assets/images/masses_sweeps.png'

export function Token(props: ImageProps) {
  const { token } = useTokenMode()
  return (
    <Image {...props} source={token === 'MANA' ? manaImage : sweepsImage} />
  )
}
