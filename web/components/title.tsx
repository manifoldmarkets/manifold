import clsx from 'clsx'

export function Title(props: { text: string; className?: string }) {
  const { text, className } = props
  return (
    <h1
      className={clsx(
        'text-3xl font-major-mono tracking-tight lowercase text-indigo-700 font-bold mt-6 mb-4',
        className
      )}
    >
      {text}
    </h1>
  )
}
