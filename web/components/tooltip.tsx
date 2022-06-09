function Tooltip(props: {
  text: string | false | undefined | null
  children: React.ReactNode
}) {
  const { text, children } = props
  return text ? (
    <div className="tooltip" data-tip={text}>
      {children}
    </div>
  ) : (
    <>{children}</>
  )
}

export default Tooltip
