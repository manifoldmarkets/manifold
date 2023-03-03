import { ExclamationIcon } from '@heroicons/react/solid'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Linkify } from './linkify'

export function AlertBox(props: {
  title: string
  text: string
  children?: React.ReactNode
}) {
  const { title, text, children } = props
  return (
    <Col className="w-full rounded-md border border-amber-400 bg-amber-50/20 p-4">
      <Row className="mb-2 flex-shrink-0">
        <ExclamationIcon
          className="h-5 w-5 text-amber-400"
          aria-hidden="true"
        />

        <div className="ml-3">
          <h3 className="text-ink-800 text-sm font-medium">{title}</h3>
        </div>
      </Row>

      <div className="text-ink-700 mt-2 whitespace-pre-line text-sm">
        {children ? (
          children
        ) : (
          <Linkify text={text} className="block whitespace-pre-line" />
        )}
      </div>
    </Col>
  )
}
