import { ENV_CONFIG } from 'common/envs/constants'
import Image from 'next/image'

export function ManaCoin() {
  return (
    <img
      src="/mana.svg"
      alt={ENV_CONFIG.moneyMoniker}
      className="inline-block"
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}
