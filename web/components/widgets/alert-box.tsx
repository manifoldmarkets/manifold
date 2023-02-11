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
    <Col className="rounded-md bg-yellow-50 p-4">
      <Row className="mb-2 flex-shrink-0">
        <ExclamationIcon
          className="h-5 w-5 text-yellow-400"
          aria-hidden="true"
        />

        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">{title}</h3>
        </div>
      </Row>

      <div className="mt-2 whitespace-pre-line text-sm text-yellow-700">
        {children ? (
          children
        ) : (
          <Linkify text={text} className="block whitespace-pre-line" />
        )}
      </div>
    </Col>
  )
}
