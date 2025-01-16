import { useTokenMode } from 'hooks/use-token-mode'
import { Image, ImageProps } from 'react-native'
import manaImage from 'assets/images/masses_mana.png'
import sweepsImage from 'assets/images/masses_sweeps.png'
import { ContractToken } from 'common/contract'

export function Token(props: { overrideToken?: ContractToken } & ImageProps) {
  const mode = useTokenMode()
  const token = props.overrideToken ?? mode.token
  return (
    <Image {...props} source={token === 'MANA' ? manaImage : sweepsImage} />
  )
}
