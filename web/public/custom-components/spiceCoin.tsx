import { ENV_CONFIG } from 'common/envs/constants'
import Image from 'next/image'

export function SpiceCoin() {
  return (
    <img
      src="/spice.svg"
      alt={'P'}
      className="inline-block"
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}
