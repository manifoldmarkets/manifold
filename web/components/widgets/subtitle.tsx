import clsx from 'clsx'

export function Subtitle(props: { children: string; className?: string }) {
  const { children: text, className } = props
  return (
    <h2
      className={clsx(
        'text-primary-500 mb-2 mt-6 inline-block text-lg sm:mb-2 sm:mt-6 sm:text-xl',
        className
      )}
    >
      {text}
    </h2>
  )
}
