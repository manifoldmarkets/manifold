import clsx from 'clsx'

export function Title(props: { text: string; className?: string }) {
  const { text, className } = props
  return (
    <h1
      className={clsx(
        'sm:text-3xl text-2xl text-indigo-700 inline-block sm:my-6 my-4',
        className
      )}
    >
      {text}
    </h1>
  )
}
