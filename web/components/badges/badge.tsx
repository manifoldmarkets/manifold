import React from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

export function Badge(props: { icon: React.ReactNode; label: string }) {
  const { icon, label } = props
  return (
    <div className="margin-left-5 flex items-center">
      <span
        className={`inline-block whitespace-nowrap rounded-full bg-blue-600 py-2.5 px-2.5 text-center align-baseline text-xs font-bold leading-none text-white`}
      >
        <Row>
          <Col>{icon}</Col>

          <Col>
            <span className="text-sm">{label}</span>
          </Col>
        </Row>
      </span>
    </div>
  )
}
