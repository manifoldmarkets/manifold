import clsx from 'clsx'
import { PencilIcon } from '@heroicons/react/outline'
import { union, difference } from 'lodash'

import { Row } from '../layout/row'
import { CATEGORIES, CATEGORY_LIST } from '../../../common/categories'
import { Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { useState } from 'react'
import { updateUser, User } from 'web/lib/firebase/users'

export function CategorySelector(props: {
  category: string
  setCategory: (category: string) => void
  className?: string
}) {
  const { className, category, setCategory } = props

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
        toggle={() => {
          setCategory('all')
        }}
      />

      <CategoryButton
        key="following"
        category="Following"
        isFollowed={category === 'following'}
        toggle={() => {
          setCategory('following')
        }}
      />

      {CATEGORY_LIST.map((cat) => (
        <CategoryButton
          key={cat}
          category={CATEGORIES[cat].split(' ')[0]}
          isFollowed={cat === category}
          toggle={() => {
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
  className?: string
}) {
  const { toggle, category, isFollowed, className } = props

  return (
    <div
      className={clsx(
        className,
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

export function EditCategoriesButton(props: { user: User }) {
  const { user } = props
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      className={clsx(
        'btn btn-sm btn-ghost cursor-pointer gap-2 whitespace-nowrap text-sm text-gray-700'
      )}
      onClick={() => setIsOpen(true)}
    >
      <PencilIcon className="inline h-4 w-4" />
      <CategorySelectorModal
        user={user}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    </div>
  )
}

function CategorySelectorModal(props: {
  user: User
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) {
  const { user, isOpen, setIsOpen } = props
  const followedCategories = user.followedCategories ?? []

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="items-center rounded bg-white p-6">
        <Col className="grid w-full grid-cols-2 gap-4">
          {CATEGORY_LIST.map((cat) => (
            <CategoryButton
              className="col-span-1"
              key={cat}
              category={CATEGORIES[cat].split(' ')[0]}
              isFollowed={followedCategories.includes(cat)}
              toggle={() => {
                updateUser(user.id, {
                  followedCategories: !followedCategories.includes(cat)
                    ? union([cat], followedCategories)
                    : difference(followedCategories, [cat]),
                })
              }}
            />
          ))}
        </Col>
      </Col>
    </Modal>
  )
}
