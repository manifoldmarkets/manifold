import clsx from 'clsx'

export function Subtitle(props: { children: string; className?: string }) {
  const { children: text, className } = props
  return (
    <h2
      className={clsx(
        'text-ink-600 inline-block font-semibold sm:text-lg',
        className
      )}
    >
      {text}
    </h2>
  )
}
