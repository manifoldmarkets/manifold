import clsx from 'clsx'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon'
import { Row } from '../layout/row'

export function ReplyToggle(props: {
  seeReplies: boolean
  numComments: number
  onClick: () => void
}) {
  const { seeReplies, numComments, onClick } = props
  return (
    <button
      className={clsx(
        'text-ink-500 text-left text-sm',
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
  )
}
