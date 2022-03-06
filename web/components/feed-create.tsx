import { Avatar } from './avatar'
import { useEffect, useRef, useState } from 'react'
import { Spacer } from './layout/spacer'
import { NewContract } from '../pages/create'
import { firebaseLogin, User } from '../lib/firebase/users'
import { ContractsGrid } from './contracts-list'
import { Contract } from '../../common/contract'
import { Col } from './layout/col'
import clsx from 'clsx'
import { SparklesIcon } from '@heroicons/react/solid'
import { Row } from './layout/row'

export function FeedPromo(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props

  return (
    <>
      <Col className="m-6 mb-1 text-center sm:m-12">
        <h1 className="mt-4 text-4xl sm:mt-5 sm:text-6xl lg:mt-6 xl:text-6xl">
          <div className="font-semibold sm:mb-2">
            A{' '}
            <span className="bg-gradient-to-r from-teal-400 to-green-400 bg-clip-text font-bold text-transparent">
              market{' '}
            </span>
            for
          </div>
          <div className="font-semibold">
            every{' '}
            <span className="bg-gradient-to-r from-teal-400 to-green-400 bg-clip-text font-bold text-transparent">
              prediction
            </span>
          </div>
        </h1>
        <Spacer h={6} />
        <div className="mb-4 text-gray-500">
          Find prediction markets on any topic imaginable. Or create your own!
          <br />
          Sign up to get M$ 1,000 and start trading.
          <br />
        </div>
        <Spacer h={6} />
        <button
          className="btn btn-lg self-center border-none bg-gradient-to-r from-teal-500 to-green-500  normal-case hover:from-teal-600 hover:to-green-600"
          onClick={firebaseLogin}
        >
          Sign up for free
        </button>{' '}
      </Col>

      <Spacer h={12} />

      <Row className="m-4 mb-6 items-center gap-1 text-xl font-semibold text-gray-800">
        <SparklesIcon className="inline h-5 w-5" aria-hidden="true" />
        Trending today
      </Row>
      <ContractsGrid
        contracts={hotContracts?.slice(0, 10) || []}
        showHotVolume
      />
    </>
  )
}

export default function FeedCreate(props: {
  user?: User
  tag?: string
  placeholder?: string
  className?: string
}) {
  const { user, tag, className } = props
  const [question, setQuestion] = useState('')
  const [focused, setFocused] = useState(false)

  const placeholders = [
    'Will anyone I know get engaged this year?',
    'Will humans set foot on Mars by the end of 2030?',
    'Will any cryptocurrency eclipse Bitcoin by market cap this year?',
    'Will the Democrats win the 2024 presidential election?',
  ]
  // Rotate through a new placeholder each day
  // Easter egg idea: click your own name to shuffle the placeholder
  // const daysSinceEpoch = Math.floor(Date.now() / 1000 / 60 / 60 / 24)

  const [randIndex] = useState(
    Math.floor(Math.random() * 1e10) % placeholders.length
  )
  const placeholder = props.placeholder ?? `e.g. ${placeholders[randIndex]}`

  const panelRef = useRef<HTMLElement | null>()
  const inputRef = useRef<HTMLTextAreaElement | null>()

  useEffect(() => {
    const onClick = () => {
      if (
        panelRef.current &&
        document.activeElement &&
        !panelRef.current.contains(document.activeElement)
      )
        setFocused(false)
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  })

  return (
    <div
      className={clsx(
        'mt-2 w-full rounded bg-white p-4 shadow-md',
        question || focused ? 'ring-2 ring-indigo-300' : '',
        className
      )}
      onClick={() => !focused && !question && inputRef.current?.focus()}
      ref={(elem) => (panelRef.current = elem)}
    >
      <div className="relative flex items-start space-x-3">
        <Avatar username={user?.username} avatarUrl={user?.avatarUrl} noLink />

        <div className="min-w-0 flex-1">
          {/* TODO: Show focus, for accessibility */}
          <div>
            <p className="my-0.5 text-sm">Ask a question... </p>
          </div>
          <textarea
            ref={inputRef as any}
            className="w-full resize-none appearance-none border-transparent bg-transparent p-0 text-lg text-indigo-700 placeholder:text-gray-400 focus:border-transparent focus:ring-transparent sm:text-xl"
            placeholder={placeholder}
            value={question}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setQuestion(e.target.value.replace('\n', ''))}
            onFocus={() => setFocused(true)}
          />
        </div>
      </div>

      {/* Hide component instead of deleting, so edits to NewContract don't get lost */}
      <div className={question || focused ? '' : 'hidden'}>
        <NewContract question={question} tag={tag} />
      </div>

      {/* Show a fake "Create Market" button, which gets replaced with the NewContract one*/}
      {!(question || focused) && (
        <div className="flex justify-end">
          <button className="btn btn-sm" disabled>
            Create Market
          </button>
        </div>
      )}
    </div>
  )
}
