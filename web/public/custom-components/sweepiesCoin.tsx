import clsx from 'clsx'

export function SweepiesCoin(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/sweepies.svg"
      alt={'S'}
      className={clsx('inline-block', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}
