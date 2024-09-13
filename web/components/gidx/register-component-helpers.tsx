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

export function BottomRow(props: { children: React.ReactNode }) {
  return <Row className={'w-full justify-between'}>{props.children}</Row>
}
