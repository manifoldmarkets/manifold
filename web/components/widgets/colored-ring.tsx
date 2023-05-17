import clsx from 'clsx'
import { Col } from '../layout/col'

export function ColoredRing(props: {
  children: React.ReactNode
  color: string
  size: number
  offset: number
}) {
  const { children, color, size, offset } = props
  return (
    <Col className={clsx(`rounded-full`, color, `h-[${size}px] w-[${size}px]`)}>
      <div className="mx-auto my-auto">{children}</div>
    </Col>
  )
}
