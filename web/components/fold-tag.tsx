import clsx from 'clsx'
import { Fold } from '../../common/fold'

export function FoldTag(props: { fold: Fold }) {
  const { fold } = props
  const { name } = fold
  return (
    <div
      className={clsx(
        'bg-white hover:bg-gray-100 px-4 py-2 rounded-full shadow-md',
        'cursor-pointer'
      )}
    >
      <span className="text-gray-500">{name}</span>
    </div>
  )
}
