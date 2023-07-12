import clsx from 'clsx'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon'
import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'

export function ReplyToggle(props: {
  seeReplies: boolean
  numComments: number
  onClick: () => void
  childrenBountyTotal?: number
}) {
  const { seeReplies, numComments, onClick, childrenBountyTotal } = props

  return (
    <Row className="items-center gap-2 text-sm">
      <button
        className={clsx(
          'text-ink-500 text-left',
          numComments === 0 ? 'hidden' : ''
        )}
        onClick={onClick}
      >
        <Row className="items-center gap-1">
          <div>
            {numComments} {numComments === 1 ? 'reply' : 'replies'}
          </div>
          <TriangleDownFillIcon
            className={clsx('h-2 w-2', seeReplies ? 'rotate-180' : '')}
          />
        </Row>
      </button>
      {childrenBountyTotal && childrenBountyTotal > 0 ? (
        <span className="text-teal-600 opacity-70 dark:text-teal-400">
          +{formatMoney(childrenBountyTotal)}
        </span>
      ) : (
        <></>
      )}
    </Row>
  )
}
