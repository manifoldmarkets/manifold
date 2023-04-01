import clsx from 'clsx'

export function Subtitle(props: { children: string; className?: string }) {
  const { children: text, className } = props
  return (
    <h2
      className={clsx(
        'text-primary-500 mt-6 mb-2 inline-block text-lg font-semibold sm:mt-6 sm:mb-2 sm:text-xl',
        className
      )}
    >
      {text}
    </h2>
  )
}
