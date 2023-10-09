import clsx from 'clsx'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'

export function ReplyToggle(props: {
  seeReplies: boolean
  numComments: number
  childrenBountyTotal?: number
  onSeeReplyClick?: () => void
}) {
  const { seeReplies, numComments, childrenBountyTotal, onSeeReplyClick } =
    props

  return (
    <Row className="items-center gap-2 text-sm" onClick={onSeeReplyClick}>
      <div
        className={clsx(
          'text-ink-500 group-hover:text-primary-500 -mx-0.5 cursor-pointer select-none rounded px-0.5 text-left transition-colors',
          numComments === 0 ? 'hidden' : ''
        )}
      >
        <Row className="items-center gap-1">
          <div>
            {numComments} {numComments === 1 ? 'reply' : 'replies'}
          </div>
          <TriangleDownFillIcon
            className={clsx('h-2 w-2', seeReplies ? 'rotate-180' : '')}
          />
        </Row>
      </div>
      {childrenBountyTotal && childrenBountyTotal > 0 ? (
        <span className="text-teal-600 opacity-70">
          +{formatMoney(childrenBountyTotal)}
        </span>
      ) : (
        <></>
      )}
    </Row>
  )
}
