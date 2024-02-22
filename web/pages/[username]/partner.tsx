import clsx from 'clsx'

import { getFullUserByUsername } from 'web/lib/supabase/users'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { Col } from 'web/components/layout/col'

import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import { BackButton } from 'web/components/contract/back-button'
import { Page } from 'web/components/layout/page'
import Custom404 from 'web/pages/404'
import Link from 'next/link'

import { useUserById } from 'web/hooks/use-user'
import { Avatar } from 'web/components/widgets/avatar'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getFullUserByUsername(username)

  return {
    props: removeUndefinedProps({
      user,
      username,
    }),
    revalidate: 60, // Regenerate after a minute
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPartner(props: {
  user: User | null
  username: string
}) {
  if (!props.user) return <Custom404 />
  return <UserPartnerDashboard user={props.user} username={props.username} />
}

function UserPartnerDashboard(props: { user: User; username: string }) {
  const user = useUserById(props.user.id) ?? props.user

  return (
    <Page
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />

      <Col className="relative mt-1">
        <Row
          className={
            ' bg-canvas-50 sticky top-0 z-10 w-full items-center justify-between gap-1 py-2 sm:gap-2 md:hidden'
          }
        >
          <Row className={'items-center gap-2'}>
            <BackButton />
            <span className={'text-primary-700 text-2xl'}>
              Creator Partner Program
            </span>
          </Row>
          <Link
            className={clsx('text-ink-500 hover:text-primary-500')}
            href={'/' + user.username}
          >
            <Col className={'items-center px-3 text-sm'}>
              <Avatar
                size={'sm'}
                noLink={true}
                username={user.username}
                avatarUrl={user.avatarUrl}
              />
            </Col>
          </Link>
        </Row>
        <Row
          className={
            'mx-1 mb-4 hidden items-center justify-between md:inline-flex'
          }
        >
          <span className={'text-primary-700 text-2xl'}>
            Creator Partner Program
          </span>
          <Link
            href={'/' + user.username}
            className={clsx('hover:text-primary-500  text-ink-600 text-xs')}
          >
            <Avatar
              avatarUrl={user.avatarUrl}
              username={user.username}
              noLink
              size="xs"
              className={'mx-auto'}
            />
            Profile
          </Link>
        </Row>
      </Col>
    </Page>
  )
}
