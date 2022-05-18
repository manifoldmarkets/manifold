import clsx from 'clsx'

import { User } from '../../../common/user'
import { Row } from '../layout/row'
import { CATEGORIES, CATEGORY_LIST } from '../../../common/categories'

export function CategorySelector(props: {
  user: User | null | undefined
  category: string
  setCategory: (category: string) => void
  className?: string
}) {
  const { className, user, category, setCategory } = props

  return (
    <Row
      className={clsx(
        'carousel mr-2 items-center space-x-2 space-y-2 overflow-x-scroll pb-4 sm:flex-wrap',
        className
      )}
    >
      <div />
      <CategoryButton
        key="all"
        category="All"
        isFollowed={category === 'all'}
        toggle={async () => {
          if (!user?.id) return
          setCategory('all')
        }}
      />

      {CATEGORY_LIST.map((cat) => (
        <CategoryButton
          key={cat}
          category={CATEGORIES[cat].split(' ')[0]}
          isFollowed={cat === category}
          toggle={async () => {
            if (!user?.id) return
            setCategory(cat)
          }}
        />
      ))}
    </Row>
  )
}

function CategoryButton(props: {
  category: string
  isFollowed: boolean
  toggle: () => void
}) {
  const { toggle, category, isFollowed } = props

  return (
    <div
      className={clsx(
        'rounded-full border-2 px-4 py-1 shadow-md hover:bg-gray-200',
        'cursor-pointer select-none',
        isFollowed ? 'border-gray-300 bg-gray-300' : 'bg-white'
      )}
      onClick={toggle}
    >
      <span className="text-sm text-gray-500">{category}</span>
    </div>
  )
}
