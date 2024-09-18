import clsx from 'clsx'
import { Row } from 'web/components/layout/row'

export function InputTitle(props: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={`text-ink-600 text-sm ${props.className}`}>
      {props.children}
    </span>
  )
}

export function BottomRow(props: {
  children: React.ReactNode
  className?: string
}) {
  const { className } = props
  return (
    <Row className={clsx('w-full justify-between', className)}>
      {props.children}
    </Row>
  )
}

export function Divider(props: { className?: string }) {
  return (
    <div
      className={clsx(
        '"bg-ink-200 dark:bg-ink-300 my-4 h-[1px] w-full',
        props.className
      )}
    />
  )
}
