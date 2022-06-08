import clsx from 'clsx'
import { PencilIcon } from '@heroicons/react/outline'
import { union, difference } from 'lodash'

import { Row } from '../layout/row'
import { CATEGORIES, CATEGORY_LIST } from '../../../common/categories'
import { Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { useState } from 'react'
import { updateUser, User } from 'web/lib/firebase/users'
import { Checkbox } from '../checkbox'

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

export function EditCategoriesButton(props: {
  user: User
  className?: string
}) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      className={clsx(
        className,
        'btn btn-sm btn-ghost cursor-pointer gap-2 whitespace-nowrap text-sm normal-case text-gray-700'
      )}
      onClick={() => setIsOpen(true)}
    >
      <PencilIcon className="inline h-4 w-4" />
      Categories
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
  const followedCategories =
    user?.followedCategories === undefined
      ? CATEGORY_LIST
      : user.followedCategories

  const selectAll =
    user.followedCategories === undefined ||
    followedCategories.length < CATEGORY_LIST.length

  return (
    <Modal open={isOpen} setOpen={setIsOpen}>
      <Col className="rounded bg-white p-6">
        <button
          className="btn btn-sm btn-ghost mb-3 self-start"
          onClick={() => {
            if (selectAll) {
              updateUser(user.id, {
                followedCategories: CATEGORY_LIST,
              })
            } else {
              updateUser(user.id, {
                followedCategories: [],
              })
            }
          }}
        >
          Select {selectAll ? 'all' : 'none'}
        </button>
        <Col className="grid w-full grid-cols-2 gap-4">
          {CATEGORY_LIST.map((cat) => (
            <Checkbox
              className="col-span-1"
              key={cat}
              label={CATEGORIES[cat].split(' ')[0]}
              checked={followedCategories.includes(cat)}
              toggle={(checked) => {
                updateUser(user.id, {
                  followedCategories: checked
                    ? difference(followedCategories, [cat])
                    : union([cat], followedCategories),
                })
              }}
            />
          ))}
        </Col>
      </Col>
    </Modal>
  )
}
