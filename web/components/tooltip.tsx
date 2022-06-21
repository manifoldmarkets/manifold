import clsx from 'clsx'

export function Tooltip(
  props: {
    text: string | false | undefined | null
  } & JSX.IntrinsicElements['div']
) {
  const { text, children, className } = props
  return text ? (
    <div className={clsx(className, 'tooltip z-10')} data-tip={text}>
      {children}
    </div>
  ) : (
    <>{children}</>
  )
}
