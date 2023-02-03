import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { formatPercentNumber } from 'common/util/format'
import { richTextToString } from 'common/util/parse'
import CountUp from 'react-countup'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { Content } from '../widgets/editor'

export default function Percent(props: {
  currPercent: number
  yesPercent: number
  noPercent: number
  outcome?: 'NO' | 'YES'
  className?: string
}) {
  const { currPercent, yesPercent, noPercent, outcome, className } = props
  return (
    <Row
      className={clsx(
        'transition-color items-center font-bold',
        !outcome && 'text-white',
        outcome === 'YES' && 'text-teal-100',
        outcome === 'NO' && 'text-scarlet-100',
        className
      )}
    >
      <div
        className={clsx(
          'text-5xl transition-all',
          !outcome && '[text-shadow:#4337c9_0_8px]',
          outcome === 'YES' &&
            '[text-shadow:#14b8a6_-6px_4px,#0f766e_-12px_8px]',
          outcome === 'NO' && '[text-shadow:#FF2400_6px_4px,#991600_12px_8px]'
        )}
      >
        {outcome === 'YES' && (
          <CountUp
            start={formatPercentNumber(currPercent)}
            end={formatPercentNumber(yesPercent)}
            duration={0.2}
          />
        )}
        {outcome === 'NO' && (
          <CountUp
            start={formatPercentNumber(currPercent)}
            end={formatPercentNumber(noPercent)}
            duration={0.2}
          />
        )}
        {!outcome && formatPercentNumber(currPercent)}
      </div>
      <div className="pt-2 text-2xl">%</div>
      <div className="ml-2 self-end text-2xl">chance</div>
    </Row>
  )
}

export function DescriptionAndModal(props: {
  description: string | JSONContent
  isModalOpen?: boolean
  setIsModalOpen?: (open: boolean) => void
}) {
  const { description, isModalOpen, setIsModalOpen } = props
  const descriptionClass = 'text-sm font-thin text-gray-100 break-words'

  const descriptionString =
    typeof description === 'string'
      ? description
      : richTextToString(description)

  return (
    <Col className={clsx(descriptionClass, 'items-end')}>
      <div className="line-clamp-3 w-full [text-shadow:_0_1px_0_rgb(0_0_0_/_40%)]">
        {descriptionString}
      </div>
      {descriptionString.length >= 100 &&
        isModalOpen != undefined &&
        setIsModalOpen && (
          <>
            <span
              className="mr-2 font-semibold text-indigo-400"
              onClick={() => setIsModalOpen(true)}
            >
              See more
            </span>
            <Modal
              open={isModalOpen}
              setOpen={setIsModalOpen}
              className={clsx(
                MODAL_CLASS,
                'pointer-events-auto max-h-[32rem] overflow-auto'
              )}
            >
              <Col>
                <Content content={descriptionString} />
              </Col>
            </Modal>
          </>
        )}
    </Col>
  )
}
