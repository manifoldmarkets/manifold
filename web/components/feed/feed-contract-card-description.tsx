import { Contract } from 'common/contract'
import { useRef, useState } from 'react'
import { Content } from '../widgets/editor'
import { ArrowRightIcon } from '@heroicons/react/solid'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { Spacer } from '../layout/spacer'
export const MAX_HEIGHT = 250

export default function FeedContractCardDescription(props: {
  contract: Contract
}) {
  const { contract } = props
  const [isOverflowing, setIsOverflowing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffectCheckEquality(() => {
    if (contentRef.current && contentRef.current.scrollHeight > MAX_HEIGHT) {
      setIsOverflowing(true)
    }
  }, [contract.description])
  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={`overflow-hidden`}
        style={{ maxHeight: `${MAX_HEIGHT}px` }}
      >
        <Spacer h={2} className="hidden sm:inline-block" />
        <Content content={contract.description} />
      </div>
      {isOverflowing && (
        <Col className="from-canvas-0 via-canvas-0 via-30% absolute bottom-0 right-0 left-0 h-12 justify-end bg-gradient-to-t to-transparent">
          <Row className="w-full justify-end">
            <span className=" text-ink-500 hover:text-primary-500 text-sm">
              Read more <ArrowRightIcon className="inline h-4 w-4" />
            </span>
          </Row>
        </Col>
      )}
    </div>
  )
}
