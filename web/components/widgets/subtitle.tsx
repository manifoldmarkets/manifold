import clsx from 'clsx'

export function Subtitle(props: { text: string; className?: string }) {
  const { text, className } = props
  return (
    <h2
      className={clsx(
        'mt-6 mb-2 inline-block text-lg text-indigo-500 sm:mt-6 sm:mb-2 sm:text-xl',
        className
      )}
    >
      {text}
    </h2>
  )
}
