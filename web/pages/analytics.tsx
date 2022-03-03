import dayjs from 'dayjs'
import _ from 'lodash'
import { DailyCountChart } from '../components/analytics/charts'
import { Col } from '../components/layout/col'
import { Spacer } from '../components/layout/spacer'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { getDailyBets } from '../lib/firebase/bets'
import { getDailyComments } from '../lib/firebase/comments'
import { getDailyContracts } from '../lib/firebase/contracts'

export async function getStaticProps() {
  const numberOfDays = 80
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

  const dailyActiveUsers = _.zip(dailyContracts, dailyBets, dailyComments).map(
    ([contracts, bets, comments]) => {
      const creatorIds = (contracts ?? []).map((c) => c.creatorId)
      const betUserIds = (bets ?? []).map((bet) => bet.userId)
      const commentUserIds = (comments ?? []).map((comment) => comment.userId)
      return _.uniq([...creatorIds, ...betUserIds, commentUserIds]).length
    }
  )

  return {
    props: {
      startDate: startDate.valueOf(),
      dailyActiveUsers,
      dailyBetCounts,
      dailyContractCounts,
      dailyCommentCounts,
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
}) {
  return (
    <Page>
      <CustomAnalytics {...props} />
      <Spacer h={8} />
      <FirebaseAnalytics />
    </Page>
  )
}

function CustomAnalytics(props: {
  startDate: number
  dailyActiveUsers: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
}) {
  const {
    startDate,
    dailyActiveUsers,
    dailyBetCounts,
    dailyContractCounts,
    dailyCommentCounts,
  } = props
  return (
    <Col>
      <Title text="Active users" />
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
