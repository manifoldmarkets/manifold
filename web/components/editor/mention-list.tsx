import { SuggestionProps } from '@tiptap/suggestion'
import clsx from 'clsx'
import { Contract } from 'common/contract'
import { FIXED_ANTE } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { contractPath } from 'web/lib/firebase/contracts'
import { Avatar } from '../avatar'
import { Col } from '../layout/col'
import { Row } from '../layout/row'

// copied from https://tiptap.dev/api/nodes/mention#usage
const M = forwardRef((props: SuggestionProps<Contract>, ref) => {
  const { items: contracts, command, query } = props
  const user = useUser()

  const [selectedIndex, setSelectedIndex] = useState(0)
  useEffect(() => setSelectedIndex(0), [contracts])

  const submitUser = (index: number) => {
    const contract = contracts[index]
    if (contract)
      command({ id: contract.id, label: contractPath(contract) } as any)
  }

  const createOptions = [
    {
      text: `Create yes/no`,
      // TODO: Get these commmands to work
      onClick: () => command({ id: 'new', label: 'new' } as any),
    },
    {
      text: `Create free response`,
      onClick: () => command({ id: 'new', label: 'new' } as any),
    },
  ]

  const choiceLength =
    contracts.length > 0 ? contracts.length : createOptions.length

  const onUp = () =>
    setSelectedIndex((i) => (i + choiceLength - 1) % choiceLength)
  const onDown = () => setSelectedIndex((i) => (i + 1) % choiceLength)
  const onEnter = () => submitUser(selectedIndex)

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        onUp()
        return true
      }
      if (event.key === 'ArrowDown') {
        onDown()
        return true
      }
      if (event.key === 'Enter') {
        onEnter()
        return true
      }
      return false
    },
  }))

  return (
    <div className="w-42 absolute z-10 overflow-x-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
      {!contracts.length ? (
        <Col>
          <Row className="mx-2 my-1 gap-2 text-gray-500">
            <Avatar avatarUrl={user?.avatarUrl} size="xs" /> <div>{query}</div>
          </Row>

          {createOptions.map((option, i) => (
            <button
              className={clsx(
                'flex h-8 w-full cursor-pointer select-none items-center gap-2 truncate px-4 hover:bg-indigo-200',
                selectedIndex == i
                  ? 'bg-indigo-500 text-white'
                  : 'text-gray-900'
              )}
              onClick={option.onClick}
              key={option.text}
            >
              {option.text}
              <span className="inline-flex items-center rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                {formatMoney(FIXED_ANTE)}
              </span>
            </button>
          ))}
        </Col>
      ) : (
        contracts.map((contract, i) => (
          <button
            className={clsx(
              'flex h-8 w-full cursor-pointer select-none items-center gap-2 truncate px-4 hover:bg-indigo-200',
              selectedIndex === i ? 'bg-indigo-500 text-white' : 'text-gray-900'
            )}
            onClick={() => submitUser(i)}
            key={contract.id}
          >
            <Avatar avatarUrl={contract.creatorAvatarUrl} size="xs" />
            {contract.question}
          </button>
        ))
      )}
    </div>
  )
})

// Just to keep the formatting pretty
export { M as MentionList }
