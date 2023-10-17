import { getUserByUsername, User } from 'web/lib/firebase/users'
import { removeUndefinedProps } from 'common/util/object'
import { Lover } from 'love/hooks/use-lover'
import { getLover } from 'love/lib/supabase/lovers'
import {
  Answer,
  getUserAnswersAndQuestions,
  Question,
} from 'love/lib/supabase/questions'
import { SEO } from 'web/components/SEO'
import Head from 'next/head'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import ImageWithBlurredShadow from 'web/components/widgets/image-with-blurred-shadow'
import { Avatar } from 'web/components/widgets/avatar'
import Link from 'next/link'
import { PencilIcon } from '@heroicons/react/outline'
import { StackedUserNames } from 'web/components/widgets/user-link'
import { DailyLeagueStat } from 'web/components/daily-league-stat'
import { QuestsOrStreak } from 'web/components/quests-or-streak'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { FollowButton } from 'web/components/buttons/follow-button'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { Linkify } from 'web/components/widgets/linkify'
import { LinkIcon } from '@heroicons/react/solid'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { fromNow } from 'web/lib/util/time'
import { LovePage } from 'love/components/love-page'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)
  const lover = user ? await getLover(user.id) : null
  const { questions, answers } = user
    ? await getUserAnswersAndQuestions(user.id)
    : { answers: [], questions: [] }

  return {
    props: removeUndefinedProps({
      user,
      username,
      lover,
      questions,
      answers,
    }),
    revalidate: 15,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPage(props: {
  user: User | null
  lover: Lover | null
  username: string
  questions: Question[]
  answers: Answer[]
}) {
  const { user, lover, answers, questions } = props
  const isMobile = useIsMobile()
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user?.id

  if (!user) {
    return <div>404</div>
  }

  return (
    <LovePage
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
      className={'p-2'}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />
      {(user.isBannedFromPosting || user.userDeleted) && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}
      <Col className={'gap-4'}>
        <Col className="mx-4 mt-1">
          <Row
            className={clsx(
              'flex-wrap gap-2 py-1',
              isMobile ? '' : 'justify-between'
            )}
          >
            <Row className={clsx('gap-2')}>
              <Col className={'relative max-h-14'}>
                <ImageWithBlurredShadow
                  image={
                    <Avatar
                      username={user.username}
                      avatarUrl={user.avatarUrl}
                      size={'lg'}
                      className="bg-ink-1000"
                      noLink
                    />
                  }
                />
                {isCurrentUser && (
                  <Link
                    className=" bg-primary-600 shadow-primary-300 hover:bg-primary-700 text-ink-0 absolute bottom-0 right-0 h-6 w-6 rounded-full p-1.5 shadow-sm"
                    href="/signup"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PencilIcon className="text-ink-0 h-3.5 w-3.5 " />
                  </Link>
                )}
              </Col>
              <StackedUserNames
                usernameClassName={'sm:text-base'}
                className={'font-bold sm:mr-0 sm:text-xl'}
                user={user}
              />
            </Row>
            {isCurrentUser ? (
              <Row className={'items-center gap-1 sm:gap-2'}>
                <DailyLeagueStat user={user} />
                <QuestsOrStreak user={user} />
              </Row>
            ) : isMobile ? (
              <>
                <div className={'my-auto'}>
                  <SendMessageButton toUser={user} currentUser={currentUser} />
                </div>
                <div className={'my-auto'}>
                  <FollowButton userId={user.id} />
                </div>
                <div className={'my-auto'}>
                  <MoreOptionsUserButton user={user} />
                </div>
              </>
            ) : (
              <Row className="items-center gap-1 sm:gap-2">
                <SendMessageButton toUser={user} currentUser={currentUser} />
                <FollowButton userId={user.id} />
                <MoreOptionsUserButton user={user} />
              </Row>
            )}
          </Row>
          <Col className={'mt-1'}>
            {user.bio && (
              <div className="sm:text-md mt-1 text-sm">
                <Linkify text={user.bio}></Linkify>
              </div>
            )}
            <Row className="text-ink-400 mt-2 flex-wrap items-center gap-2 sm:gap-4">
              {user.website && (
                <a
                  href={
                    'https://' +
                    user.website.replace('http://', '').replace('https://', '')
                  }
                >
                  <Row className="items-center gap-1">
                    <LinkIcon className="h-4 w-4" />
                    <span className="text-ink-400 text-sm">{user.website}</span>
                  </Row>
                </a>
              )}

              {user.twitterHandle && (
                <a
                  href={`https://twitter.com/${user.twitterHandle
                    .replace('https://www.twitter.com/', '')
                    .replace('https://twitter.com/', '')
                    .replace('www.twitter.com/', '')
                    .replace('twitter.com/', '')}`}
                >
                  <Row className="items-center gap-1">
                    <img
                      src="/twitter-logo.svg"
                      className="h-4 w-4"
                      alt="Twitter"
                    />
                    <span className="text-ink-400 text-sm">
                      {user.twitterHandle}
                    </span>
                  </Row>
                </a>
              )}
            </Row>
          </Col>
        </Col>
        {lover && <LoverAttributes lover={lover} />}
        {answers.length > 0 && (
          <Col className={''}>
            <Row className={'text-xl font-bold'}>Answers</Row>
            <Row className={'flex-wrap gap-4'}>
              {answers
                .filter(
                  (a) => a.multiple_choice ?? a.free_response ?? a.integer
                )
                .map((answer) => {
                  const question = questions.find(
                    (q) => q.id === answer.question_id
                  )
                  if (!question) return null
                  const options = question.multiple_choice_options as Record<
                    string,
                    number
                  >
                  const optionKey = options
                    ? Object.keys(options).find(
                        (k) => options[k] === answer.multiple_choice
                      )
                    : null

                  return (
                    <Col
                      key={question.id}
                      className={'bg-canvas-0 flex-grow rounded-md p-2'}
                    >
                      <Row className={'font-bold'}>{question.question}</Row>
                      <Row>
                        {answer.free_response ?? optionKey ?? answer.integer}
                      </Row>
                    </Col>
                  )
                })}
            </Row>
          </Col>
        )}
      </Col>
    </LovePage>
  )
}
const LoverAttributes = (props: { lover: Lover }) => {
  const { lover } = props

  const loverPropsTitles: { [key: string]: string } = {
    birthdate: 'Age',
    last_online_time: 'Last online',
    city: 'City',
    gender: 'Gender',
    pref_gender: 'Interested gender',
    pref_relation_styles: 'Relationship styles',
    drinks_per_month: 'Drinks per month',
    pref_age_max: 'Preferred age max',
    pref_age_min: 'Preferred age min',
    education_level: 'Education level',
    ethnicity: 'Ethnicity',
    has_kids: 'Number of kids',
    has_pets: 'Has pets',
    born_in_location: 'Birthplace',
    height_in_inches: 'Height (inches)',
    is_smoker: 'Smokes',
    is_vegetarian_or_vegan: 'Vegetarian or vegan',
    political_beliefs: 'Political beliefs',
    religious_belief_strength: 'Strength of religious belief',
    religious_beliefs: 'Religious beliefs',
    wants_kids_strength: 'Desire for kids',
  }

  const cardClassName = 'p-2 bg-canvas-0 h-20 w-40 gap-1 rounded-md'
  return (
    <Row className={'flex-wrap gap-4'}>
      {Object.keys(loverPropsTitles).map((k) => {
        const key = k as keyof Omit<Lover, 'user'>
        if (!loverPropsTitles[key] || lover[key] === undefined) return null

        const formattedValue = formatValue(key, lover[key])
        if (formattedValue === null || formattedValue.length === 0) return null
        if (
          key == 'religious_belief_strength' &&
          !lover['religious_beliefs']?.length
        )
          return null

        return (
          <Col key={key} className={cardClassName}>
            <Row className={'font-bold'}>{loverPropsTitles[key]}</Row>
            <Row>{formattedValue}</Row>
          </Col>
        )
      })}
      {/* Special case for min and max age range */}
      <Col className={cardClassName}>
        <Row className={'font-bold'}>Preferred Age Range</Row>
        <Row>{`${lover.pref_age_min} - ${lover.pref_age_max}`}</Row>
      </Col>
    </Row>
  )
}
const formatValue = (key: string, value: any) => {
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  switch (key) {
    case 'birthdate':
      return fromNow(new Date(value).valueOf()).replace(' ago', '')
    case 'created_time':
    case 'last_online_time':
      return fromNow(new Date(value).valueOf())
    case 'is_smoker':
    case 'is_vegetarian_or_vegan':
    case 'has_pets':
      return value ? 'Yes' : 'No'
    case 'pref_age_max':
    case 'pref_age_min':
      return null // handle this in a special case
    default:
      return value
  }
}
