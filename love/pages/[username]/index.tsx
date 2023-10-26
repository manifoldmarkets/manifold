import { PencilIcon } from '@heroicons/react/outline'
import { removeUndefinedProps } from 'common/util/object'
import { LovePage } from 'love/components/love-page'
import { LoverCommentSection } from 'love/components/lover-comment-section'
import LoverProfileHeader from 'love/components/lover-profile-header'
import { Matches } from 'love/components/matches'
import ProfileCarousel from 'love/components/profile-carousel'
import { useLoverByUser } from 'love/hooks/use-lover'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, getUserByUsername, User } from 'web/lib/firebase/users'
import LoverAbout from 'love/components/lover-about'
import { orderBy } from 'lodash'
import { Subtitle } from 'love/components/widgets/lover-subtitle'
import { useUserAnswersAndQuestions } from 'love/hooks/use-questions'
import clsx from 'clsx'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getUserByUsername(username)
  return {
    props: removeUndefinedProps({
      user,
      username,
    }),
    revalidate: 15,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPage(props: {
  user: User | null
  username: string
}) {
  const { user } = props
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user?.id
  const router = useRouter()

  const lover = useLoverByUser(user ?? undefined)
  const { questions, answers: allAnswers } = useUserAnswersAndQuestions(
    user?.id
  )
  const answers = allAnswers.filter(
    (a) => a.multiple_choice ?? a.free_response ?? a.integer
  )

  if (currentUser === undefined) return <div></div>
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
            <LoverAbout lover={lover} />
            <Col className={'mt-2 gap-2'}>
              <Row className={'items-center gap-2'}>
                <Subtitle>Answers</Subtitle>
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
              <Row className={clsx('flex-wrap gap-3')}>
                {answers.length > 0 ? (
                  orderBy(
                    answers,
                    (a) => (a.free_response ? 3 : a.multiple_choice ? 2 : 1),
                    'desc'
                  ).map((answer) => {
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
