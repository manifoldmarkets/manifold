import clsx from 'clsx'

export function Title(props: { text: string; className?: string }) {
  const { text, className } = props
  return (
    <h1
      className={clsx('text-3xl text-indigo-700 inline-block my-6', className)}
    >
      {text}
    </h1>
  )
}
