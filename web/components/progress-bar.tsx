import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Row } from './layout/row'

export const ProgressBar = (props: {
  value: number
  max: number
  className?: string
  color?: string
  showPercentage?: boolean
}) => {
  const { value, max, className, color = 'bg-blue-500' } = props
  const percentage = (value / max) * 100
  return (
    <Row className={'w-full justify-center'}>
      <Col
        className={clsx(
          `h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700`,
          className
        )}
      >
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </Col>
    </Row>
  )
}
