import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { fromPropz } from 'web/hooks/use-propz'
import Analytics, {
  CustomAnalytics,
  FirebaseAnalytics,
  getStaticPropz,
} from '../stats'

export const getStaticProps = fromPropz(getStaticPropz)

export default function AnalyticsEmbed(props: Parameters<typeof Analytics>[0]) {
  return (
    <Col className="w-full bg-white dark:bg-black px-2">
      <CustomAnalytics {...props} />
      <Spacer h={8} />
      <FirebaseAnalytics />
    </Col>
  )
}
