import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'
import Image from 'next/image'

export function SweepiesFlatCoin(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/sweepiesFlat.svg"
      alt={ENV_CONFIG.moneyMoniker}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}
