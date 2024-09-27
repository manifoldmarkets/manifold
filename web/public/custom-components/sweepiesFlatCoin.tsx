import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'

export function SweepiesFlatCoin(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/SweepiesFlat.svg"
      alt={ENV_CONFIG.moneyMoniker}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
      }}
    />
  )
}
