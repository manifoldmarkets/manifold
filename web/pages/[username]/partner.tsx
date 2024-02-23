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
import { PARTNER_USER_IDS } from 'common/envs/constants'
import { Subtitle } from 'web/components/widgets/subtitle'
import { format } from 'date-fns'
import { FaExternalLinkAlt } from 'react-icons/fa'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import DonutChart from 'web/components/donut-chart'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'

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
  const userIsPartner = PARTNER_USER_IDS.includes(user.id)

  const currentDate = new Date()
  const startDate = new Date()
  startDate.setDate(currentDate.getDate() - 90)

  const formattedStartDate = format(startDate, 'MMM dd, yyyy')
  const formattedEndDate = format(currentDate, 'MMM dd, yyyy')

  const { data } = useAPIGetter('get-partner-stats', {
    userId: user.id,
  })
  const referralCount = 2
  const referralIncome = referralCount * 0.4
  const realisedTraderIncome = data ? data.numUniqueBettors * 0.06 : 0
  const unresolvedTraderIncome = data ? data.numUniqueBettors * 0.04 : 0
  const dollarsEarned = realisedTraderIncome + referralIncome

  const segments = [
    { label: 'Traders', value: realisedTraderIncome, color: '#995cd6' },
    { label: 'Referrals', value: referralIncome, color: '#5cd65c' },
    //{ label: 'Other', value: , color: '#d65c99'},
  ]

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

      <Col className="relative mx-2 mt-1">
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
          className={' mb-4 hidden items-center justify-between md:inline-flex'}
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
        {userIsPartner ? (
          <Col className=" mt-2 items-start gap-2">
            <div className="text-ink-700">Period Feb 21 - May 21</div>

            {data && (
              <Row className="  gap-6 self-start text-lg">
                <Row className=" gap-2">
                  <div className="text-ink-700">Traders:</div>
                  <div className=" font-semibold">{data.numUniqueBettors}</div>
                </Row>
                <Row className="gap-2">
                  <div className="text-ink-700 ">Referrals:</div>
                  <div className="font-semibold">{referralCount}</div>
                </Row>
              </Row>
            )}
            <DonutChart segments={segments} total={dollarsEarned} />
            <Row className="text-ink-700 items-center gap-2 text-lg">
              <span>
             Unresolved trader income: ${unresolvedTraderIncome} {''}
              <InfoTooltip
                text={
                  'This represents the sum of the $0.04 per trader that is received after resolving a market. This is not included in the total shown above.'
                }
              /> </span>
            </Row>
          </Col>
        ) : (
          <Col className="gap-4 ">
            <Col className=" mx-0 my-auto max-w-[600px] border p-2">
              <Subtitle className="!mt-0 border-b pb-2">
                {user.name}'s progress to partner
              </Subtitle>
              <Row className="justify-between border-b pb-2">
                <div>
                  <b>Reach 500 unique traders</b>
                </div>
                <div>
                  {' '}
                  <b>253{}</b>/500
                </div>
              </Row>
              <div className="text-ink-700 bg-ink-200 my-2 rounded p-2 px-6 text-sm">
                <b>90-day performance</b> ({formattedStartDate} - {''}
                {formattedEndDate})
              </div>
              <Row className="justify-between border-b pb-2">
                <div>
                  <b>Average of 10 traders per market</b>
                </div>
                <div>
                  <b>7{}</b>/10
                </div>
              </Row>
              <Row className="mt-2 justify-between">
                <div>
                  <b>Create 10 markets</b>
                </div>
                <div>
                  <b>7{}</b>/10
                </div>
              </Row>
            </Col>

            <div>
              There are certain circumstances where we may accept applications
              outside of these criteria. Some instances may include having an
              established audience on other platforms or a history of
              exceptional forecasting.
            </div>
            <div>
              {' '}
              Please email {''}
              <a
                href="mailto:david@manifold.markets"
                className="text-primary-500 hover:text-primary-700 hover:underline"
              >
                david@manifold.markets
              </a>{' '}
              once you meet the minimum criteria and want to join the program.
            </div>
            <div>
              Meeting the minimum requirements does not guarantee partnership.
              We also take into consideration user behaviour and market quality
              and will initially be accepting new partners at a slow rate.
            </div>
          </Col>
        )}
        <div className="text-primary-500 hover:text-primary-700 text-md my-4 hover:underline">
          <a href="/partner-explainer" className="flex items-baseline">
            Learn more about the program here!{' '}
            <FaExternalLinkAlt className="ml-1 h-3 w-3" />
          </a>
        </div>
      </Col>
    </Page>
  )
}
