import { SparklesIcon, XIcon } from '@heroicons/react/solid'
import { Avatar } from './avatar'
import { useEffect, useRef, useState } from 'react'
import { Spacer } from './layout/spacer'
import { NewContract } from '../pages/create'
import { firebaseLogin, User } from '../lib/firebase/users'
import { ContractsGrid } from './contract/contracts-list'
import { Contract, MAX_QUESTION_LENGTH } from '../../common/contract'
import { Col } from './layout/col'
import clsx from 'clsx'
import { Row } from './layout/row'
import { ENV_CONFIG } from '../../common/envs/constants'
import _ from 'lodash'
import { SiteLink } from './site-link'

export function FeedPromo(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props

  return (
    <>
      <Col className="my-6 rounded-xl text-center sm:m-12">
        <h1 className="text-4xl sm:text-6xl xl:text-6xl">
          <div className="font-semibold sm:mb-2">A market for</div>
          <span className="bg-gradient-to-r from-teal-400 to-green-400 bg-clip-text font-bold text-transparent">
            every question
          </span>
        </h1>
        <Spacer h={6} />
        <div className="mb-4 px-2 text-gray-500">
          Bet on any topic imaginable. Or create your own market!
          <br />
          Sign up and get M$1,000 - worth $10 to your{' '}
          <SiteLink className="font-semibold" href="/charity">
            favorite charity.
          </SiteLink>
          <br />
        </div>
        <Spacer h={6} />
        <button
          className="self-center rounded-md border-none bg-gradient-to-r from-teal-500 to-green-500 py-4 px-6 text-lg font-semibold normal-case text-white hover:from-teal-600 hover:to-green-600"
          onClick={firebaseLogin}
        >
          Start betting now
        </button>{' '}
      </Col>

      <Row className="m-4 mb-6 items-center gap-1 text-xl font-semibold text-gray-800">
        <SparklesIcon className="inline h-5 w-5" aria-hidden="true" />
        Trending markets
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
  const [isExpanded, setIsExpanded] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>()

  // Rotate through a new placeholder each day
  // Easter egg idea: click your own name to shuffle the placeholder
  // const daysSinceEpoch = Math.floor(Date.now() / 1000 / 60 / 60 / 24)

  // Take care not to produce a different placeholder on the server and client
  const [defaultPlaceholder, setDefaultPlaceholder] = useState('')
  useEffect(() => {
    setDefaultPlaceholder(
      `e.g. ${_.sample(ENV_CONFIG.newQuestionPlaceholders)}`
    )
  }, [])

  const placeholder = props.placeholder ?? defaultPlaceholder

  return (
    <div
      className={clsx(
        'w-full cursor-text rounded bg-white p-4 shadow-md',
        isExpanded ? 'ring-2 ring-indigo-300' : '',
        className
      )}
      onClick={() => {
        !isExpanded && inputRef.current?.focus()
      }}
    >
      <div className="relative flex items-start space-x-3">
        <Avatar username={user?.username} avatarUrl={user?.avatarUrl} noLink />

        <div className="min-w-0 flex-1">
          <Row className="justify-between">
            <p className="my-0.5 text-sm">Ask a question... </p>
            {isExpanded && (
              <button
                className="btn btn-xs btn-circle btn-ghost rounded"
                onClick={() => setIsExpanded(false)}
              >
                <XIcon
                  className="mx-auto h-6 w-6 text-gray-500"
                  aria-hidden="true"
                />
              </button>
            )}
          </Row>
          <textarea
            ref={inputRef as any}
            className={clsx(
              'w-full resize-none appearance-none border-transparent bg-transparent p-0 text-indigo-700 placeholder:text-gray-400 focus:border-transparent focus:ring-transparent',
              question && 'text-lg sm:text-xl',
              !question && 'text-base sm:text-lg'
            )}
            placeholder={placeholder}
            value={question}
            rows={question.length > 68 ? 4 : 2}
            maxLength={MAX_QUESTION_LENGTH}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setQuestion(e.target.value.replace('\n', ''))}
            onFocus={() => setIsExpanded(true)}
          />
        </div>
      </div>

      {/* Hide component instead of deleting, so edits to NewContract don't get lost */}
      <div className={isExpanded ? '' : 'hidden'}>
        <NewContract question={question} tag={tag} />
      </div>

      {/* Show a fake "Create Market" button, which gets replaced with the NewContract one*/}
      {!isExpanded && (
        <div className="flex justify-end sm:-mt-4">
          <button className="btn btn-sm capitalize" disabled>
            Create Market
          </button>
        </div>
      )}
    </div>
  )
}
