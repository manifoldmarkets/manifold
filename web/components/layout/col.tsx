export function Col(props: { children?: any; className?: string }) {
  const { children, className } = props

  return <div className={`${className} flex flex-col`}>{children}</div>
}
