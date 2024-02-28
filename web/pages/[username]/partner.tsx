import clsx from 'clsx'

import {
  getContractsCreatedLastMonth,
  getFullUserByUsername,
} from 'web/lib/supabase/users'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { Col } from 'web/components/layout/col'

import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
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
import { useEffect, useState } from 'react'
import { TbReportMoney } from 'react-icons/tb'
import {
  PARTNER_UNIQUE_TRADER_BONUS,
  PARTNER_UNIQUE_TRADER_BONUS_MULTI,
} from 'common/partner'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { APIResponse } from 'common/api/schema'

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

  const { data } = useAPIGetter('get-partner-stats', {
    userId: user.id,
  })

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

      <Col className="relative mx-3 mt-1">
        <Row
          className={
            ' mt-2 items-center justify-between md:mt-0 md:inline-flex'
          }
        >
          <Row className={'items-center gap-2'}>
            <span className={'text-primary-700 text-2xl'}>Partner Program</span>
          </Row>
          <Row className="items-end gap-3 ">
            <div className="flex flex-col items-end">
              <Link
                href={`/${user.username}/portfolio`}
                className={clsx(
                  'hover:text-primary-500  text-ink-600 text-xs '
                )}
              >
                <TbReportMoney className="mx-auto text-2xl " />
                Portfolio
              </Link>
            </div>
            <div className="flex flex-col items-end">
              <Link
                href={'/' + user.username}
                className={clsx(
                  'hover:text-primary-500  text-ink-600 text-xs '
                )}
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
            </div>
          </Row>
        </Row>

        {userIsPartner ? (
          data ? (
            <PartnerDashboard data={data} />
          ) : (
            <LoadingIndicator />
          )
        ) : (
          <PartnerExplainer user={user} />
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

const PartnerDashboard = (props: {
  data: APIResponse<'get-partner-stats'>
}) => {
  const { data } = props
  const {
    numUniqueBettors,
    numBinaryBettors,
    numMultiChoiceBettors,
    numReferrals,
  } = data

  const referralIncome = numReferrals
  const totalTraderIncome =
    numBinaryBettors * PARTNER_UNIQUE_TRADER_BONUS +
    numMultiChoiceBettors * PARTNER_UNIQUE_TRADER_BONUS_MULTI
  console.log(data)
  const realisedTraderIncome = totalTraderIncome * 0.6
  const unresolvedTraderIncome = totalTraderIncome * 0.4
  const dollarsEarned = realisedTraderIncome + referralIncome

  const segments = [
    { label: 'Traders', value: realisedTraderIncome, color: '#995cd6' },
    { label: 'Referrals', value: referralIncome, color: '#5cd65c' },
    //{ label: 'Other', value: , color: '#d65c99'},
  ]

  return (
    <Col className="mt-4 items-start gap-2">
      <div className="text-ink-700">Period Feb 26 - May 26</div>

      {data && (
        <Row className="  gap-6 self-start text-lg">
          <Row className=" gap-2">
            <div className="text-ink-700">Traders:</div>
            <div className=" font-semibold">{numUniqueBettors}</div>
          </Row>
          <Row className="gap-2">
            <div className="text-ink-700 ">Referrals:</div>
            <div className="font-semibold">{referralIncome}</div>
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
          />{' '}
        </span>
      </Row>
    </Col>
  )
}

const PartnerExplainer = (props: { user: User }) => {
  const { user } = props

  const currentDate = new Date()
  const startDate = new Date()
  startDate.setDate(1)
  startDate.setDate(startDate.getDate() - 1)
  startDate.setDate(1)

  const formattedStartDate = format(startDate, 'MMM dd, yyyy')
  const formattedEndDate = format(currentDate, 'MMM dd, yyyy')

  const [marketsCreated, setMarketsCreated] = useState<number | undefined>()
  useEffect(() => {
    getContractsCreatedLastMonth(user.id).then(setMarketsCreated)
  }, [user.id])

  return (
    <Col className="gap-4 ">
      <Col className=" mx-0 my-auto mt-4 max-w-[600px] border p-2">
        <Subtitle className="!mt-0 border-b pb-2">
          {user.name}'s progress to partner
        </Subtitle>
        <Row className="justify-between border-b pb-2">
          <div>
            <b>Reach 500 unique traders</b>
          </div>
          <div>
            {' '}
            <b>{user.creatorTraders.allTime}</b>/500
          </div>
        </Row>
        <div className="text-ink-700 bg-ink-200 my-2 rounded p-2 px-6 text-sm">
          <b>Monthly performance</b> ({formattedStartDate} - {''}
          {formattedEndDate})
        </div>
        <Row className="justify-between border-b pb-2">
          <div>
            <b>Average of 10 traders per market</b>
          </div>
          <div>
            <b>
              {marketsCreated
                ? (user.creatorTraders.monthly / marketsCreated).toFixed(1)
                : '0'}
            </b>
            /10
          </div>
        </Row>
        <Row className="mt-2 justify-between">
          <div>
            <b>Create 10 markets</b>
          </div>
          <div>
            <b>{marketsCreated ?? '0'}</b>/10
          </div>
        </Row>
      </Col>

      <div>
        There are certain circumstances where we may accept applications outside
        of these criteria. Some instances may include having an established
        audience on other platforms or a history of exceptional forecasting.
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
        Meeting the minimum requirements does not guarantee partnership. We also
        take into consideration user behaviour and market quality and will
        initially be accepting new partners at a slow rate.
      </div>
    </Col>
  )
}
