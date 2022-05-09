import { FirstArgument } from 'common/util/types'
import { Col } from '../../components/layout/col'
import { Spacer } from '../../components/layout/spacer'
import { fromPropz } from '../../hooks/use-propz'
import Analytics, {
  CustomAnalytics,
  FirebaseAnalytics,
  getStaticPropz,
} from '../analytics'

export const getStaticProps = fromPropz(getStaticPropz)

export default function AnalyticsEmbed(props: FirstArgument<typeof Analytics>) {
  return (
    <Col className="w-full bg-white px-2">
      <CustomAnalytics {...props} />
      <Spacer h={8} />
      <FirebaseAnalytics />
    </Col>
  )
}
