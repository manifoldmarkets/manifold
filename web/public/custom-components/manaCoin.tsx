import clsx from 'clsx'

export function ManaCoin(props: { className?: string }) {
  const { className } = props
  return (
    <img
      src="/sumcoin-logo.png"
      alt="SUM"
      className={clsx('inline-block rounded-full', className)}
      style={{
        width: '1em',
        height: '1em',
        marginRight: '0.1em',
      }}
    />
  )
}
