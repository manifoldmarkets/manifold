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
    <button className="text-left text-sm text-indigo-600" onClick={onClick}>
      <Row className="items-center gap-1">
        <div>
          {numComments} {numComments === 1 ? 'Reply' : 'Replies'}
        </div>
        <TriangleDownFillIcon
          className={clsx('h-2 w-2', seeReplies ? 'rotate-180' : '')}
        />
      </Row>
    </button>
  )
}
