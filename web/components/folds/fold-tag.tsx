import clsx from 'clsx'
import { Fold } from 'common/fold'

export function FoldTag(props: { fold: Fold }) {
  const { fold } = props
  const { name } = fold
  return (
    <div
      className={clsx(
        'rounded-full bg-white dark:bg-black px-4 py-2 shadow-md hover:bg-gray-100 dark:hover:bg-gray-900',
        'cursor-pointer'
      )}
    >
      <span className="text-gray-500">{name}</span>
    </div>
  )
}
