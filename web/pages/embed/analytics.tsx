import { Col } from '../../components/layout/col'
import { Spacer } from '../../components/layout/spacer'
import { fromPropz } from '../../hooks/use-propz'
import {
  CustomAnalytics,
  FirebaseAnalytics,
  getStaticPropz,
} from '../analytics'

export const getStaticProps = fromPropz(getStaticPropz)

export default function AnalyticsEmbed(props: {
  startDate: number
  dailyActiveUsers: number[]
  dailyBetCounts: number[]
  dailyContractCounts: number[]
  dailyCommentCounts: number[]
  monthlyActiveUsers: number[]
}) {
  return (
    <Col className="w-full px-2 bg-white">
      <CustomAnalytics {...props} />
      <Spacer h={8} />
      <FirebaseAnalytics />
    </Col>
  )
}
