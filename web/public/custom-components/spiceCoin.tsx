import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'
import Image from 'next/image'

export function SpiceCoin(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/SweepiesCoin.svg"
      alt={'P'}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}
