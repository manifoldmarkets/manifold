import dayjs from 'dayjs'
import _ from 'lodash'
import { IS_PRIVATE_MANIFOLD } from '../../common/envs/constants'
import { DailyCountChart } from '../components/analytics/charts'
import { Col } from '../components/layout/col'
import { Spacer } from '../components/layout/spacer'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { fromPropz, usePropz } from '../hooks/use-propz'
import { getDailyBets } from '../lib/firebase/bets'
import { getDailyComments } from '../lib/firebase/comments'
import { getDailyContracts } from '../lib/firebase/contracts'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz() {
  const numberOfDays = 90
  const today = dayjs(dayjs().format('YYYY-MM-DD'))
  const startDate = today.subtract(numberOfDays, 'day')

  const [dailyBets, dailyContracts, dailyComments] = await Promise.all([
    getDailyBets(startDate.valueOf(), numberOfDays),
    getDailyContracts(startDate.valueOf(), numberOfDays),
    getDailyComments(startDate.valueOf(), numberOfDays),
  ])

  const dailyBetCounts = dailyBets.map((bets) => bets.length)
  const dailyContractCounts = dailyContracts.map(
    (contracts) => contracts.length
  )
  const dailyCommentCounts = dailyComments.map((comments) => comments.length)

  const dailyUserIds = _.zip(dailyContracts, dailyBets, dailyComments).map(
    ([contracts, bets, comments]) => {
      const creatorIds = (contracts ?? []).map((c) => c.creatorId)
      const betUserIds = (bets ?? []).map((bet) => bet.userId)
      const commentUserIds = (comments ?? []).map((comment) => comment.userId)
      return _.uniq([...creatorIds, ...betUserIds, ...commentUserIds])
    }
  )

  const dailyActiveUsers = dailyUserIds.map((userIds) => userIds.length)

  const monthlyActiveUsers = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 30)
    const end = i
    const uniques = new Set<string>()
    for (let j = start; j <= end; j++)
      dailyUserIds[j].forEach((userId) => uniques.add(userId))
    return uniques.size
  })

  return {
    props: {
      startDate: startDate.valueOf(),
      dailyActiveUsers,
      dailyBetCounts,
      dailyContractCounts,
      dailyCommentCounts,
      monthlyActiveUsers,
    },
    revalidate: 12 * 60 * 60, // regenerate after half a day
  }
}

export default function Analytics(props: {
  startDate: number
  dailyActiveUsers: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
  monthlyActiveUsers: number[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    startDate: 0,
    dailyActiveUsers: [],
    dailyBetCounts: [],
    dailyContractCounts: [],
    dailyCommentCounts: [],
  }
  return (
    <Page>
      <CustomAnalytics {...props} />
      <Spacer h={8} />
      {!IS_PRIVATE_MANIFOLD && <FirebaseAnalytics />}
    </Page>
  )
}

function CustomAnalytics(props: {
  startDate: number
  monthlyActiveUsers: number[]
  dailyActiveUsers: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
}) {
  const {
    startDate,
    monthlyActiveUsers,
    dailyActiveUsers,
    dailyBetCounts,
    dailyContractCounts,
    dailyCommentCounts,
  } = props
  return (
    <Col>
      <Title text="Monthly Active users" />
      <DailyCountChart dailyCounts={monthlyActiveUsers} startDate={startDate} />

      <Title text="Daily Active users" />
      <DailyCountChart dailyCounts={dailyActiveUsers} startDate={startDate} />

      <Title text="Bets count" />
      <DailyCountChart
        dailyCounts={dailyBetCounts}
        startDate={startDate}
        small
      />

      <Title text="Markets count" />
      <DailyCountChart
        dailyCounts={dailyContractCounts}
        startDate={startDate}
        small
      />

      <Title text="Comments count" />
      <DailyCountChart
        dailyCounts={dailyCommentCounts}
        startDate={startDate}
        small
      />
    </Col>
  )
}

function FirebaseAnalytics() {
  // Edit dashboard at https://datastudio.google.com/u/0/reporting/faeaf3a4-c8da-4275-b157-98dad017d305/page/Gg3/edit
  return (
    <iframe
      className="w-full"
      height={2200}
      src="https://datastudio.google.com/embed/reporting/faeaf3a4-c8da-4275-b157-98dad017d305/page/Gg3"
      frameBorder="0"
      style={{ border: 0 }}
      allowFullScreen
    />
  )
}
