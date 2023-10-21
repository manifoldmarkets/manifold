import { PencilIcon } from '@heroicons/react/outline'
import { removeUndefinedProps } from 'common/util/object'
import { LovePage } from 'love/components/love-page'
import { LoverCommentSection } from 'love/components/lover-comment-section'
import LoverProfileHeader from 'love/components/lover-profile-header'
import { Matches } from 'love/components/matches'
import ProfileCarousel from 'love/components/profile-carousel'
import { Lover } from 'love/hooks/use-lover'
import { getLoverRow } from 'love/lib/supabase/lovers'
import {
  Answer,
  getUserAnswersAndQuestions,
  Question,
} from 'love/lib/supabase/questions'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, getUserByUsername, User } from 'web/lib/firebase/users'
import { fromNow } from 'web/lib/util/time'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)
  const lover = user ? await getLoverRow(user.id).catch(() => null) : null
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
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user?.id
  const router = useRouter()

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
        {!currentUser ? (
          <Col className={'bg-canvas-0 items-center justify-center p-4'}>
            <Row className={' items-center justify-center gap-2'}>
              <Button color={'gradient'} onClick={firebaseLogin}>
                Sign up
              </Button>{' '}
              to see {user.name}'s profile!
            </Row>
          </Col>
        ) : lover ? (
          <>
            {lover.photo_urls && <ProfileCarousel lover={lover} />}
            <LoverProfileHeader
              isCurrentUser={isCurrentUser}
              currentUser={currentUser}
              user={user}
              lover={lover}
              router={router}
            />

            <Matches userId={user.id} />

            <LoverAttributes lover={lover} />
            {answers.length > 0 ? (
              <Col className={'mt-2 gap-2'}>
                <Row className={'items-center gap-2'}>
                  <span className={'text-xl font-semibold'}>Answers</span>
                  <Button
                    color={'gray-outline'}
                    size="xs"
                    className={''}
                    onClick={() => router.push('love-questions')}
                  >
                    <PencilIcon className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </Row>
                <Row className={'flex-wrap gap-3'}>
                  {answers
                    .filter(
                      (a) => a.multiple_choice ?? a.free_response ?? a.integer
                    )
                    .map((answer) => {
                      const question = questions.find(
                        (q) => q.id === answer.question_id
                      )
                      if (!question) return null
                      const options =
                        question.multiple_choice_options as Record<
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
                          className={
                            'bg-canvas-0 flex-grow rounded-md px-3 py-2'
                          }
                        >
                          <Row className={'font-semibold'}>
                            {question.question}
                          </Row>
                          <Row>
                            {answer.free_response ??
                              optionKey ??
                              answer.integer}
                          </Row>
                        </Col>
                      )
                    })}
                </Row>
              </Col>
            ) : isCurrentUser ? (
              <Col className={'mt-4 w-full items-center'}>
                <Row>
                  <Button onClick={() => router.push('love-questions')}>
                    Answer questions
                  </Button>
                </Row>
              </Col>
            ) : (
              <Col className={'mt-2 gap-2'}>
                <span className={'text-xl font-semibold'}>Answers</span>
                <span className={'text-ink-500 text-sm'}>Nothing yet :(</span>
              </Col>
            )}
          </>
        ) : (
          isCurrentUser && (
            <Col className={'mt-4 w-full items-center'}>
              <Row>
                <Button onClick={() => router.push('signup')}>
                  Create a profile
                </Button>
              </Row>
            </Col>
          )
        )}
      </Col>
      {currentUser && (
        <LoverCommentSection onUser={user} currentUser={currentUser} />
      )}
    </LovePage>
  )
}

const LoverAttributes = (props: { lover: Lover }) => {
  const { lover } = props

  const loverPropsTitles: { [key: string]: string } = {
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

  const cardClassName = 'px-3 py-2 bg-canvas-0 w-40 gap-1 rounded-md'
  return (
    <Row className={'flex-wrap gap-3'}>
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
            <Row className={'font-semibold'}>{loverPropsTitles[key]}</Row>
            <Row>{formattedValue}</Row>
          </Col>
        )
      })}
      {/* Special case for min and max age range */}
      <Col className={cardClassName}>
        <Row className={'font-semibold'}>Preferred Age Range</Row>
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
