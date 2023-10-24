import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
} from '@heroicons/react/outline'
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
import { useRef, useState } from 'react'
import clsx from 'clsx'
import { useSafeLayoutEffect } from 'web/hooks/use-safe-layout-effect'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)
  const lover = user
    ? await getLoverRow(user.id).catch((e) => {
        console.error(e)
        return null
      })
    : null
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
  const { user, lover, questions } = props
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user?.id
  const router = useRouter()
  const answers = props.answers.filter(
    (a) => a.multiple_choice ?? a.free_response ?? a.integer
  )

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
            <Col className={'mt-2 gap-2'}>
              <Row className={'items-center gap-2'}>
                <span className={'text-xl font-semibold'}>Answers</span>
                {isCurrentUser && answers.length > 0 && (
                  <Button
                    color={'gray-outline'}
                    size="xs"
                    className={''}
                    onClick={() => router.push('love-questions')}
                  >
                    <PencilIcon className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
              </Row>
              <Row className={'flex-wrap gap-3'}>
                {answers.length > 0 ? (
                  answers.map((answer) => {
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
                        className={'bg-canvas-0 flex-grow rounded-md px-3 py-2'}
                      >
                        <Row className={'font-semibold'}>
                          {question.question}
                        </Row>
                        <Row>
                          {answer.free_response ?? optionKey ?? answer.integer}
                        </Row>
                      </Col>
                    )
                  })
                ) : isCurrentUser ? (
                  <Col className={'mt-4 w-full items-center'}>
                    <Row>
                      <Button onClick={() => router.push('love-questions')}>
                        Answer questions
                      </Button>
                    </Row>
                  </Col>
                ) : (
                  <span className={'text-ink-500 text-sm'}>Nothing yet :(</span>
                )}
              </Row>
            </Col>
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
      {currentUser && lover && (
        <LoverCommentSection
          onUser={user}
          lover={lover}
          currentUser={currentUser}
        />
      )}
    </LovePage>
  )
}

const LoverAttributes = (props: { lover: Lover }) => {
  const { lover } = props

  const loverPropsTitles: {
    [key in keyof Partial<Omit<Lover, 'user'>>]: string
  } = {
    last_online_time: 'Last online',
    pref_gender: 'Interested gender',
    pref_relation_styles: 'Relationship styles',
    drinks_per_month: 'Drinks per month',
    pref_age_max: 'Preferred age max',
    pref_age_min: 'Preferred age min',
    education_level: 'Education level',
    ethnicity: 'Ethnicity',
    has_kids: 'Number of kids',
    born_in_location: 'Birthplace',
    is_smoker: 'Smokes',
    is_vegetarian_or_vegan: 'Vegetarian or vegan',
    political_beliefs: 'Political beliefs',
    religious_belief_strength: 'Strength of religious belief',
    religious_beliefs: 'Religious beliefs',
    wants_kids_strength: 'Desire for kids',
    company: 'Company',
    looking_for_matches: '',
    messaging_status: '',
    occupation: 'Occupation',
    occupation_title: 'Title',
    university: 'University',
  }
  const [showMore, setShowMore] = useState<boolean | undefined>(undefined)
  const [shouldAllowCollapseOfContent, setShouldAllowCollapseOfContent] =
    useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const user = useUser()
  const isYou = user?.id === lover.user_id

  useSafeLayoutEffect(() => {
    if (
      contentRef.current &&
      contentRef.current.offsetHeight > 180 &&
      showMore === undefined &&
      isYou
    ) {
      setShouldAllowCollapseOfContent(true)
      setShowMore(false)
    }
  }, [contentRef.current?.offsetHeight, isYou])

  const cardClassName = 'px-3 py-2 bg-canvas-0 w-40 gap-1 rounded-md'
  return (
    <Row
      className={clsx(
        'relative flex-wrap gap-3 overflow-hidden',
        showMore === undefined || showMore ? 'h-full' : 'max-h-24 '
      )}
      ref={contentRef}
    >
      {Object.keys(loverPropsTitles).map((k) => {
        const key = k as keyof Omit<Lover, 'user'>
        if (
          !loverPropsTitles[key] ||
          lover[key] === undefined ||
          lover[key] === null
        )
          return null
        const formattedValue = formatLoverValue(key, lover[key])
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
      {!showMore && shouldAllowCollapseOfContent && (
        <>
          <div className="from-canvas-50 absolute bottom-0 h-8 w-full rounded-b-md bg-gradient-to-t" />
        </>
      )}
      {shouldAllowCollapseOfContent && (
        <Button
          color={'gray-outline'}
          className={'absolute bottom-0 right-0'}
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? (
            <ChevronUpIcon className="mr-2 h-4 w-4" />
          ) : (
            <ChevronDownIcon className="mr-2 h-4 w-4" />
          )}
          Show {showMore ? 'less' : 'more'}
        </Button>
      )}
    </Row>
  )
}
export const formatLoverValue = (key: string, value: any) => {
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
    case 'height_in_inches':
      return `${Math.floor(value / 12)}' ${value % 12}"`
    case 'pref_age_max':
    case 'pref_age_min':
      return null // handle this in a special case
    case 'wants_kids_strength':
      return renderAgreementScale(value)
    default:
      return value
  }
}

const renderAgreementScale = (value: number) => {
  if (value == 1) return 'Strongly disagree'
  if (value == 2) return 'Disagree'
  if (value == 3) return 'Neutral'
  if (value == 4) return 'Agree'
  if (value == 5) return 'Strongly agree'
  return ''
}
