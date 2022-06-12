import clsx from 'clsx'

export function Title(props: { text: string; className?: string }) {
  const { text, className } = props
  return (
    <h1
      className={clsx(
        'my-4 inline-block text-2xl text-indigo-700 dark:text-indigo-300 sm:my-6 sm:text-3xl',
        className
      )}
    >
      {text}
    </h1>
  )
}
