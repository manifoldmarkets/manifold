import { ReactNode } from 'react'

export const JoinSpans = (props: {
  children: any[]
  separator?: ReactNode
}) => {
  const { separator } = props
  const children = props.children.filter((x) => !!x)

  if (children.length === 0) return <></>
  if (children.length === 1) return children[0]
  if (children.length === 2)
    return (
      <>
        {children[0]} and {children[1]}
      </>
    )

  const head = children.slice(0, -1).map((child) => (
    <>
      {child}
      {separator || ','}{' '}
    </>
  ))

  const tail = children[children.length - 1]

  return (
    <>
      {head}and {tail}
    </>
  )
}
