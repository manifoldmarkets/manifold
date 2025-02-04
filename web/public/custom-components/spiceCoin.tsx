import clsx from 'clsx'

export function SpiceCoin(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/spice.svg"
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
