import { ExclamationIcon } from '@heroicons/react/solid'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Linkify } from './linkify'
import clsx from 'clsx'

export function AlertBox(props: {
  title: string
  text: string
  children?: React.ReactNode
  className?: string
}) {
  const { title, text, children, className } = props
  return (
    <Col
      className={clsx(
        'w-full rounded-md border border-amber-400 bg-amber-50/20 p-4',
        className
      )}
    >
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
