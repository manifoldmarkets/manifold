export function Row(props: { children?: any; className?: string }) {
  const { children, className } = props

  return <div className={`${className} flex flex-row`}>{children}</div>
}
