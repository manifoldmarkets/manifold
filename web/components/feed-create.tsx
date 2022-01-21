import { useUser } from '../hooks/use-user'
import { AvatarWithIcon } from './contract-feed'
import { Title } from './title'
import Textarea from 'react-expanding-textarea'
import { useState } from 'react'
import { Spacer } from './layout/spacer'
import { NewContract } from '../pages/create'
import { firebaseLogin } from '../lib/firebase/users'
import { useHotContracts } from '../hooks/use-contracts'
import { ContractsGrid } from './contracts-list'
import { SiteLink } from './site-link'

export function FeedPromo() {
  // TODO: Encode in static props
  const hotContracts = useHotContracts()

  return (
    <>
      <div className="w-full bg-indigo-50 p-6 sm:border-2 sm:border-indigo-100 sm:rounded-lg">
        <Title
          text="Bet on the future"
          className="!mt-2 text-gray-800 !text-4xl"
        />
        <div className="text-gray-500 mb-4">
          On Manifold Markets, you can find prediction markets run by your
          favorite creators.
          <br />
          <button
            className="bg-gradient-to-r gradient-to-r from-teal-500 to-green-500 text-transparent bg-clip-text hover:underline hover:decoration-gray-300 hover:decoration-2"
            onClick={firebaseLogin}
          >
            Sign up to get M$ 1000 for free
          </button>{' '}
          and start trading!
          <br />
        </div>

        <div className="flex flex-wrap mt-2 gap-2">
          {['#politics', '#covid', '#gaming', '#sports', '#meta'].map((tag) => (
            <Hashtag tag={tag} />
          ))}
        </div>
        <Spacer h={4} />

        <ContractsGrid
          contracts={hotContracts?.slice(0, 2) || []}
          showHotVolume
        />
      </div>

      <div className="text-gray-800 text-lg mb-0 mt-6 mx-6">
        Recent community activity
      </div>
    </>
  )
}

function Hashtag(props: { tag: string }) {
  const { tag } = props
  return (
    <SiteLink href={`/tag/${tag.substring(1)}`} className="flex items-center">
      <div className="bg-white hover:bg-gray-100 cursor-pointer px-4 py-2 rounded-full shadow-md">
        <span className="text-gray-500">{tag}</span>
      </div>
    </SiteLink>
  )
}

export default function FeedCreate() {
  const user = useUser()
  const [question, setQuestion] = useState('')

  if (!user) {
    // TODO: Improve logged-out experience
    return <FeedPromo />
  }

  const placeholders = [
    'Will I make a new friend this week?',
    'Will we discover that the world is a simulation?',
    'Will anyone I know get engaged this year?',
    'Will humans set foot on Mars by the end of 2030?',
    'If I switch jobs, will I have more free time in 6 months than I do now?',
    'Will any cryptocurrency eclipse Bitcoin by market cap?',
  ]
  // Rotate through a new placeholder each day
  // Easter egg idea: click your own name to shuffle the placeholder
  const daysSinceEpoch = Math.floor(Date.now() / 1000 / 60 / 60 / 24)
  const placeholder = placeholders[daysSinceEpoch % placeholders.length]

  return (
    <div className="w-full bg-indigo-50 sm:rounded-md p-4">
      <div className="relative flex items-start space-x-3">
        <AvatarWithIcon
          username={user.username}
          avatarUrl={user.avatarUrl || ''}
        />
        <div className="min-w-0 flex-1">
          {/* TODO: Show focus, for accessibility */}
          <div>
            <p className="my-0.5 text-sm">Ask a question... </p>
          </div>
          <Textarea
            className="text-lg sm:text-xl text-indigo-700 w-full border-transparent focus:border-transparent bg-transparent p-0 appearance-none resize-none focus:ring-transparent"
            placeholder={`e.g. ${placeholder}`}
            value={question}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setQuestion(e.target.value || '')}
          />
          <Spacer h={4} />
        </div>
      </div>
      {/* Hide component instead of deleting, so edits to NewContract don't get lost */}
      <div className={question ? '' : 'hidden'}>
        <NewContract question={question} />
      </div>
      {/* Show a fake "Create Market" button, which gets replaced with the NewContract one*/}
      {!question && (
        <div className="flex justify-end">
          <button className="btn" disabled>
            Create Market
          </button>
        </div>
      )}
    </div>
  )
}
