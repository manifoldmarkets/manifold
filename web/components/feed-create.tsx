import { useUser } from '../hooks/use-user'
import { ResolutionOrChance } from './contract-card'
import { AvatarWithIcon } from './contract-feed'
import { Col } from './layout/col'
import { Title } from './title'
import Textarea from 'react-expanding-textarea'

export default function FeedCreate() {
  const user = useUser()
  if (!user) {
    return <Title text="Sign in to start trading!" />
  }

  const question = 'Ask a question...'
  const description =
    'Resolves YES under no circumstances, but perhaps lorem ipsum will come and save the day!\nI kinda doubt it though...'

  return (
    <Col className="items-center">
      <div className="w-full max-w-3xl bg-indigo-50 rounded-md">
        <div className="relative flex items-start space-x-3 p-4">
          <AvatarWithIcon
            username={user.username}
            avatarUrl={user.avatarUrl || ''}
          />
          <div className="min-w-0 flex-1 py-1.5">
            {/* Text form to type a question */}
            {/* TODO: Figure out how to get rid of border; but also show focus for accessibility */}
            <Textarea
              className="text-lg sm:text-xl text-indigo-700 w-full border-transparent focus:border-transparent bg-transparent p-0 appearance-none resize-none outline-hidden focus:outline-none"
              placeholder={question}
            />

            {/* "Create" button on the bottom right */}
            <button className="float-right bg-indigo-500 text-white text-sm font-semibold py-2 px-4 rounded-md">
              CREATE MARKET
            </button>
          </div>
        </div>
      </div>
    </Col>
  )
}
